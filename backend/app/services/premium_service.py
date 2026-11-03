"""Premium entitlements from RevenueCat (V11-P0, decision D1).

Two ways in, both from RevenueCat and never from the app:

- ``handle_webhook``: RevenueCat's webhook. Each delivery is claimed once in
  the ``revenuecat_events`` ledger (unique event id), so a retried delivery is
  a no-op. Grants (purchase, renewal, ...) make the user Premium until the
  event's expiry; a cancellation keeps Premium to the end of the paid period;
  an expiration ends it. An event older than the one that last changed the
  user (webhooks can arrive out of order) changes nothing.
- ``refresh``: read the subscriber from RevenueCat's REST API, after a
  purchase or restore in the app, so the app need not wait for the webhook.

The app user id in RevenueCat is our user id (the app calls ``logIn`` with
it); a purchase made before ``logIn`` reaches us with the user id in
``aliases``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.entitlements import is_premium
from app.models.database import RevenueCatEvent, User
from app.models.schemas import RevenueCatWebhookEvent
from app.services.analytics_service import AnalyticsService
from app.services.revenuecat_client import (
    PremiumState,
    RevenueCatClient,
    RevenueCatUnavailableError,
)

logger = logging.getLogger(__name__)

# Events that give (or give back) the entitlement until their expiry.
GRANT_TYPES = frozenset(
    {
        "INITIAL_PURCHASE",
        "RENEWAL",
        "UNCANCELLATION",
        "PRODUCT_CHANGE",
        "NON_RENEWING_PURCHASE",
        "SUBSCRIPTION_EXTENDED",
        "TEMPORARY_ENTITLEMENT_GRANT",
        "REFUND_REVERSED",
    }
)
# Events that keep the entitlement as it is but move its expiry: a
# cancellation keeps Premium to the end of the paid period (a refund's expiry
# is already past), a billing issue to the end of the grace period.
EXPIRY_ONLY_TYPES = frozenset({"CANCELLATION", "BILLING_ISSUE"})
REVOKE_TYPES = frozenset({"EXPIRATION"})
TRANSFER = "TRANSFER"

APPLIED = "applied"
DUPLICATE = "duplicate"
STALE = "stale"
IGNORED = "ignored"
UNKNOWN_USER = "unknown_user"


def _from_ms(ms: int | None) -> datetime | None:
    return None if ms is None else datetime.fromtimestamp(ms / 1000, tz=UTC)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _user_ids(candidates: list[str | None]) -> list[uuid.UUID]:
    """Our user ids among RevenueCat app user ids, in order, without repeats.
    Anonymous ids ($RCAnonymousID:...) are not ours and are skipped."""
    ids: list[uuid.UUID] = []
    for value in candidates:
        if not value:
            continue
        try:
            parsed = uuid.UUID(value)
        except ValueError:
            continue
        if parsed not in ids:
            ids.append(parsed)
    return ids


class PremiumService:
    def __init__(
        self,
        db: AsyncSession,
        analytics: AnalyticsService | None = None,
        revenuecat: RevenueCatClient | None = None,
    ) -> None:
        self.db = db
        self.analytics = analytics
        self.revenuecat = revenuecat

    # -- the webhook ---------------------------------------------------------

    async def handle_webhook(self, event: RevenueCatWebhookEvent) -> str:
        at = _from_ms(event.event_timestamp_ms) or clock.now()
        ledger_id = await self._claim(event, at)
        if ledger_id is None:
            return DUPLICATE

        if event.type == TRANSFER:
            outcome, user_id = await self._transfer(event, at)
        else:
            outcome, user_id = await self._apply(event, at)

        await self.db.execute(
            update(RevenueCatEvent)
            .where(RevenueCatEvent.id == ledger_id)
            .values(outcome=outcome, user_id=user_id)
        )
        logger.info(
            "revenuecat event %s type=%s outcome=%s", event.id, event.type, outcome
        )
        return outcome

    async def _claim(self, event: RevenueCatWebhookEvent, at: datetime) -> uuid.UUID:
        insert = (
            pg_insert if self.db.bind.dialect.name == "postgresql" else (sqlite_insert)
        )
        result = await self.db.execute(
            insert(RevenueCatEvent)
            .values(
                id=uuid.uuid4(),
                event_id=event.id,
                event_type=event.type,
                outcome="received",
                event_at=at,
            )
            .on_conflict_do_nothing(index_elements=["event_id"])
            .returning(RevenueCatEvent.id)
        )
        return result.scalar_one_or_none()

    def _names_premium(self, event: RevenueCatWebhookEvent) -> bool:
        wanted = get_settings().revenuecat_entitlement_id
        if event.entitlement_ids is not None:
            return wanted in event.entitlement_ids
        return event.entitlement_id == wanted

    async def _locked_user(self, ids: list[uuid.UUID]) -> User | None:
        """The first of ``ids`` that is a user, locked for this transaction so
        two events for one user apply one after the other."""
        if not ids:
            return None
        rows = (
            await self.db.execute(
                select(User)
                .where(User.id.in_(ids))
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
        by_id = {u.id: u for u in rows}
        return next((by_id[i] for i in ids if i in by_id), None)

    async def _apply(
        self, event: RevenueCatWebhookEvent, at: datetime
    ) -> tuple[str, uuid.UUID | None]:
        kind = event.type
        if kind not in GRANT_TYPES | EXPIRY_ONLY_TYPES | REVOKE_TYPES:
            return IGNORED, None
        user = await self._locked_user(
            _user_ids(
                [event.app_user_id, event.original_app_user_id, *(event.aliases or [])]
            )
        )
        if user is None:
            return UNKNOWN_USER, None
        if not self._names_premium(event):
            return IGNORED, user.id
        last = _utc(user.premium_updated_at)
        if last is not None and at < last:
            return STALE, user.id

        expires = _from_ms(event.expiration_at_ms)
        if kind in GRANT_TYPES:
            state = PremiumState(
                active=True, expires_at=expires, product_id=event.product_id
            )
        elif kind in EXPIRY_ONLY_TYPES:
            state = PremiumState(
                active=user.premium_active,
                expires_at=expires if expires is not None else user.premium_expires_at,
                product_id=event.product_id or user.premium_product_id,
            )
        else:
            state = PremiumState(
                active=False,
                expires_at=expires,
                product_id=event.product_id or user.premium_product_id,
            )
        self._set(user, state, at, source="webhook", event_type=kind)
        return APPLIED, user.id

    async def _transfer(
        self, event: RevenueCatWebhookEvent, at: datetime
    ) -> tuple[str, uuid.UUID | None]:
        """A purchase moved between app user ids (a restore on another account).

        With the REST API, every user on both sides is read back from
        RevenueCat. Without it, the old owners lose Premium and the new owner
        gets it with its next webhook or refresh.
        """
        old = _user_ids(event.transferred_from or [])
        new = _user_ids(event.transferred_to or [])
        touched: list[uuid.UUID] = []
        for user_id in [*old, *new]:
            user = await self._locked_user([user_id])
            if user is None:
                continue
            last = _utc(user.premium_updated_at)
            if last is not None and at < last:
                continue
            state: PremiumState | None = None
            if self.revenuecat is not None:
                try:
                    state = await self.revenuecat.get_premium(str(user_id))
                except RevenueCatUnavailableError:
                    state = None
            if state is None and user_id in old and user_id not in new:
                state = PremiumState(active=False, expires_at=user.premium_expires_at)
            if state is None:
                continue
            self._set(user, state, at, source="webhook", event_type=TRANSFER)
            touched.append(user_id)
        if not touched:
            return UNKNOWN_USER, None
        owner = next((u for u in new if u in touched), touched[0])
        return APPLIED, owner

    # -- the REST read -------------------------------------------------------

    async def refresh(self, user: User) -> User:
        """Read ``user``'s entitlement from RevenueCat and store it.

        Raises RevenueCatUnavailableError when there is no API key or the read
        fails; the stored entitlement is then left as it was.
        """
        if self.revenuecat is None:
            raise RevenueCatUnavailableError("RevenueCat API key not configured")
        state = await self.revenuecat.get_premium(str(user.id))
        locked = await self._locked_user([user.id])
        if locked is None:
            return user
        self._set(locked, state, clock.now(), source="refresh", event_type=None)
        await self.db.flush()
        return locked

    # -- shared --------------------------------------------------------------

    def _set(
        self,
        user: User,
        state: PremiumState,
        at: datetime,
        *,
        source: str,
        event_type: str | None,
    ) -> None:
        was = is_premium(user)
        user.premium_active = state.active
        user.premium_expires_at = state.expires_at
        user.premium_product_id = state.product_id
        user.premium_updated_at = at
        now = is_premium(user)
        if now != was and self.analytics is not None:
            props: dict = {"is_premium": now, "source": source}
            if event_type is not None:
                props["event_type"] = event_type
            self.analytics.emit("premium_status_changed", props, user.id)
