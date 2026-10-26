"""Push delivery: send pending Notification rows to the user's devices.

Beat runs this every minute. Each Notification is pushed at most once:
push_status moves from NULL (pending) to sending, then to sent | failed, or
straight to no_device | expired.

A run claims its rows by committing them as `sending` before anything reaches
Expo, and only NULL rows are ever selected, so a claimed row is never sent
again. When Expo surely rejected a request (expo_rejected), its rows go back
to NULL and the next run retries them. When the outcome is unknown (a lost
response, a dead worker, a failed commit), they end as `failed`: an alert may
be lost, but never shown twice.
"""

import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, select, update

from app.core.config import get_settings
from app.core.dependencies import get_sync_session_factory
from app.models.database import Notification, PushToken
from app.services.push_service import (
    EXPO_MAX_BATCH,
    ExpoPushClient,
    PushMessage,
    expo_rejected,
)
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
    # A run that died after its claim leaves rows `sending`. Expo may have
    # delivered them, so settle them as failed instead of sending again.
    db.execute(
        update(Notification)
        .where(
            Notification.push_status == "sending",
            Notification.created_at < cutoff,
        )
        .values(push_status="failed")
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

    claimed: list[Notification] = []
    targets: list[tuple[Notification, str, PushMessage]] = []
    for n in pending:
        tokens = tokens_by_user.get(n.user_id, [])
        if not tokens:
            n.push_status = "no_device"
            continue
        n.push_status = "sending"
        claimed.append(n)
        for token in tokens:
            message = PushMessage(
                to=token,
                title=n.title,
                body=n.body,
                data={
                    "notification_id": str(n.id),
                    "type": n.type,
                    "url": DASHBOARD_URL,
                },
            )
            targets.append((n, token, message))
    # The claim: commit `sending` before the first POST.
    db.commit()

    delivered: set = set()  # notification ids with an ok ticket
    unknown: set = set()  # notification ids Expo may have delivered
    retry: set = set()  # notification ids with messages Expo surely did not take
    for start in range(0, len(targets), EXPO_MAX_BATCH):
        chunk = targets[start : start + EXPO_MAX_BATCH]
        try:
            tickets = client.send([message for _, _, message in chunk])
        except httpx.HTTPError as error:
            rejected = expo_rejected(error)
            unsent = targets[start:] if rejected else targets[start + len(chunk) :]
            retry.update(n.id for n, _, _ in unsent)
            if not rejected:
                unknown.update(n.id for n, _, _ in chunk)
            logger.warning(
                "Expo push send failed (%s); %d messages left for the next run",
                "rejected" if rejected else "outcome unknown",
                len(unsent),
                exc_info=True,
            )
            break

        dead_tokens: set[str] = set()
        for (n, token, _), ticket in zip(chunk, tickets, strict=True):
            if ticket.status == "ok":
                delivered.add(n.id)
                n.push_status = "sent"
            elif ticket.error_code == "DeviceNotRegistered":
                dead_tokens.add(token)
            else:
                logger.warning(
                    "Expo push ticket error %s for notification %s",
                    ticket.error_code or ticket.message,
                    n.id,
                )
        if dead_tokens:
            db.execute(delete(PushToken).where(PushToken.token.in_(dead_tokens)))
        # Record this request before the next, so a later failure cannot lose it.
        db.commit()

    for n in claimed:
        if n.id in delivered:
            continue
        if n.id in retry and n.id not in unknown:
            n.push_status = None
        else:
            n.push_status = "failed"
    db.commit()
