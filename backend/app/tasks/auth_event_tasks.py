"""Erase sign-in activity older than the retention period.

auth_events rows hold the IP address and user agent of each sign-in, sign-up
and password event. Beat runs this daily and deletes rows older than
``auth_event_retention_days`` (default 365).

Each batch runs in one transaction that locks its rows (SKIP LOCKED, so two
workers take different rows). A run that dies part way leaves the remaining
rows past the cutoff, so the next run deletes them; a second run finds
nothing to delete.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.dependencies import get_sync_session_factory
from app.models.database import AuthEvent
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

BATCH_SIZE = 1000


@celery_app.task(name="app.tasks.auth_event_tasks.purge_old_auth_events")
def purge_old_auth_events_task() -> None:
    retention = timedelta(days=get_settings().auth_event_retention_days)
    with get_sync_session_factory()() as db:
        count = purge_old_auth_events(db, now=datetime.now(UTC), retention=retention)
    logger.info("Purged %d auth events older than %d days", count, retention.days)


def purge_old_auth_events(
    db, now: datetime, retention: timedelta, batch_size: int = BATCH_SIZE
) -> int:
    """Delete auth events created before ``now - retention``; return the count."""
    cutoff = now - retention
    total = 0
    while count := _purge_batch(db, cutoff, batch_size):
        total += count
    return total


def _purge_batch(db, cutoff: datetime, size: int) -> int:
    ids = (
        db.execute(
            select(AuthEvent.id)
            .where(AuthEvent.created_at < cutoff)
            .order_by(AuthEvent.created_at)
            .limit(size)
            .with_for_update(skip_locked=True)
        )
        .scalars()
        .all()
    )
    if not ids:
        db.rollback()
        return 0
    db.execute(delete(AuthEvent).where(AuthEvent.id.in_(ids)))
    db.commit()
    return len(ids)
