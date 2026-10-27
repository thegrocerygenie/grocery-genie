"""Erase soft-deleted receipts and budgets once the restore window has passed.

Beat runs this daily. A receipt or budget whose deleted_at is older than
RESTORE_WINDOW can no longer be restored, so it is hard-deleted:

- receipt: its line_items, the receipts row, and its image files (original,
  converted JPEG, thumbnail); receipt_corrections go by ON DELETE CASCADE;
- budget: the budget_threshold notifications that name it and the budgets
  row; budget_alerts_sent goes by ON DELETE CASCADE.

Each batch runs in one transaction that locks its rows (SKIP LOCKED, so two
workers take different rows). Files go first, then rows, then the commit. A
run that dies at any point leaves the rows still past the window, so the next
run selects them again, finds any already-removed file missing, and finishes.
No run can leave a file without its row.
"""

import contextlib
import json
import logging
import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.dependencies import get_sync_session_factory
from app.core.retention import restore_cutoff
from app.image.storage import (
    RECEIPT_EXTS,
    THUMBNAIL_EXT,
    generate_receipt_path,
    generate_thumbnail_path,
)
from app.models.database import (
    Budget,
    LineItem,
    Notification,
    Receipt,
)
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

BATCH_SIZE = 100


@dataclass
class PurgeResult:
    receipts: int = 0
    budgets: int = 0
    # Image files removed. Zero with receipts purged means the worker cannot
    # see the API's storage_path (or a crashed run removed them first).
    files: int = 0


@celery_app.task(name="app.tasks.purge_tasks.purge_expired_deletions")
def purge_expired_deletions_task() -> None:
    with get_sync_session_factory()() as db:
        result = purge_expired_deletions(
            db, storage_path=get_settings().storage_path, now=datetime.now(UTC)
        )
    logger.info(
        "Purged %d receipts (%d image files) and %d budgets past the restore window",
        result.receipts,
        result.files,
        result.budgets,
    )


def purge_expired_deletions(
    db, storage_path: str, now: datetime, batch_size: int = BATCH_SIZE
) -> PurgeResult:
    cutoff = restore_cutoff(now)
    result = PurgeResult()
    while True:
        count, files = _purge_receipt_batch(db, storage_path, cutoff, batch_size)
        if not count:
            break
        result.receipts += count
        result.files += files
    while count := _purge_budget_batch(db, cutoff, batch_size):
        result.budgets += count
    return result


def _expired(model, cutoff: datetime):
    return model.deleted_at.is_not(None), model.deleted_at < cutoff


def _purge_receipt_batch(
    db, storage_path: str, cutoff: datetime, size: int
) -> tuple[int, int]:
    """Erase one batch; return (receipts, image files removed)."""
    ids = (
        db.execute(
            select(Receipt.id)
            .where(*_expired(Receipt, cutoff))
            .order_by(Receipt.deleted_at)
            .limit(size)
            .with_for_update(skip_locked=True)
        )
        .scalars()
        .all()
    )
    if not ids:
        db.rollback()
        return 0, 0
    files = sum(_remove_receipt_files(storage_path, i) for i in ids)
    # line_items.receipt_id has no ON DELETE CASCADE.
    db.execute(delete(LineItem).where(LineItem.receipt_id.in_(ids)))
    db.execute(delete(Receipt).where(Receipt.id.in_(ids)))
    db.commit()
    return len(ids), files


def _purge_budget_batch(db, cutoff: datetime, size: int) -> int:
    rows = db.execute(
        select(Budget.id, Budget.user_id)
        .where(*_expired(Budget, cutoff))
        .order_by(Budget.deleted_at)
        .limit(size)
        .with_for_update(skip_locked=True)
    ).all()
    if not rows:
        db.rollback()
        return 0
    ids = [row.id for row in rows]
    notification_ids = _threshold_notifications_for(
        db, {row.user_id for row in rows}, {str(i) for i in ids}
    )
    if notification_ids:
        db.execute(delete(Notification).where(Notification.id.in_(notification_ids)))
    # Recheck the window in the delete itself: create_budget can revive a
    # deleted budget of the same category and period start.
    db.execute(delete(Budget).where(Budget.id.in_(ids), *_expired(Budget, cutoff)))
    db.commit()
    return len(ids)


def _threshold_notifications_for(
    db, user_ids: set[uuid.UUID], budget_ids: set[str]
) -> list[uuid.UUID]:
    """Threshold notifications name their budget only inside the JSON `data`."""
    rows = db.execute(
        select(Notification.id, Notification.data).where(
            Notification.user_id.in_(user_ids),
            Notification.type == "budget_threshold",
            Notification.data.is_not(None),
        )
    ).all()
    matched = []
    for row in rows:
        try:
            budget_id = json.loads(row.data).get("budget_id")
        except (ValueError, AttributeError):
            continue
        if budget_id in budget_ids:
            matched.append(row.id)
    return matched


def _remove_receipt_files(storage_path: str, receipt_id: uuid.UUID) -> int:
    paths = [generate_receipt_path(receipt_id, ext) for ext in RECEIPT_EXTS]
    paths.append(generate_thumbnail_path(receipt_id, THUMBNAIL_EXT))
    removed = 0
    for path in paths:
        # Missing: never stored with this extension, or a crashed run removed it.
        with contextlib.suppress(FileNotFoundError):
            os.remove(os.path.join(storage_path, path))
            removed += 1
    return removed
