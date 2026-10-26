"""Push delivery: send pending Notification rows to the user's devices.

Beat runs this every minute. Each Notification is pushed at most once:
push_status moves from NULL (pending) to sent | no_device | failed | expired.
A transport error leaves rows pending, so the next run retries them.
"""

import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, select, update

from app.core.config import get_settings
from app.core.dependencies import get_sync_session_factory
from app.models.database import Notification, PushToken
from app.services.push_service import ExpoPushClient, PushMessage
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
# Tapping a push opens the dashboard (BC-06: link to the full dashboard).
DASHBOARD_URL = "/"


@celery_app.task(name="app.tasks.push_tasks.deliver_pending_pushes")
def deliver_pending_pushes_task() -> None:
    settings = get_settings()
    client = ExpoPushClient(access_token=settings.expo_push_access_token or None)
    with get_sync_session_factory()() as db:
        deliver_pending_pushes(
            db,
            client,
            now=datetime.now(UTC),
            max_age=timedelta(minutes=settings.push_max_age_minutes),
        )


def deliver_pending_pushes(
    db,
    client,
    now: datetime,
    max_age: timedelta = timedelta(hours=1),
) -> None:
    cutoff = now - max_age
    db.execute(
        update(Notification)
        .where(Notification.push_status.is_(None), Notification.created_at < cutoff)
        .values(push_status="expired")
        # Let the database compare timestamps; in-Python evaluation trips on
        # naive vs aware datetimes.
        .execution_options(synchronize_session="fetch")
    )

    # SKIP LOCKED: a second worker running at the same time takes other rows
    # instead of sending these twice (Postgres; ignored by SQLite).
    pending = (
        db.execute(
            select(Notification)
            .where(
                Notification.push_status.is_(None),
                Notification.created_at >= cutoff,
            )
            .order_by(Notification.created_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
        .scalars()
        .all()
    )

    user_ids = {n.user_id for n in pending}
    tokens_by_user: dict = {}
    if user_ids:
        for token in db.execute(
            select(PushToken).where(PushToken.user_id.in_(user_ids))
        ).scalars():
            tokens_by_user.setdefault(token.user_id, []).append(token.token)

    messages: list[PushMessage] = []
    targets: list[tuple[Notification, str]] = []
    for n in pending:
        tokens = tokens_by_user.get(n.user_id, [])
        if not tokens:
            n.push_status = "no_device"
            continue
        for token in tokens:
            messages.append(
                PushMessage(
                    to=token,
                    title=n.title,
                    body=n.body,
                    data={
                        "notification_id": str(n.id),
                        "type": n.type,
                        "url": DASHBOARD_URL,
                    },
                )
            )
            targets.append((n, token))

    if messages:
        try:
            tickets = client.send(messages)
        except httpx.HTTPError:
            logger.warning(
                "Expo push send failed; %d notifications stay pending",
                len({n.id for n, _ in targets}),
                exc_info=True,
            )
            db.commit()  # keep the expired / no_device updates
            return

        delivered: set = set()
        dead_tokens: set[str] = set()
        for (n, token), ticket in zip(targets, tickets, strict=True):
            if ticket.status == "ok":
                delivered.add(n.id)
            elif ticket.error_code == "DeviceNotRegistered":
                dead_tokens.add(token)
            else:
                logger.warning(
                    "Expo push ticket error %s for notification %s",
                    ticket.error_code or ticket.message,
                    n.id,
                )
        for n, _ in targets:
            n.push_status = "sent" if n.id in delivered else "failed"
        if dead_tokens:
            db.execute(delete(PushToken).where(PushToken.token.in_(dead_tokens)))

    db.commit()
