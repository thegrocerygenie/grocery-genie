"""PremiumService ordering: the REST refresh against webhooks, and two
deliveries of one webhook at once (V11-P0, decision D1)."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.entitlements import is_premium
from app.models.database import RevenueCatEvent, User
from app.models.schemas import RevenueCatWebhookEvent
from app.services.premium_service import APPLIED, DUPLICATE, PremiumService
from app.services.revenuecat_client import PremiumState

USER_ID = uuid.UUID("00000000-0000-0000-0000-0000000000c1")


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _event(type_: str, *, at: datetime, expires: datetime, event_id: str | None = None):
    return RevenueCatWebhookEvent(
        id=event_id or str(uuid.uuid4()),
        type=type_,
        app_user_id=str(USER_ID),
        entitlement_ids=["premium"],
        product_id="gg_premium_monthly",
        expiration_at_ms=_ms(expires),
        event_timestamp_ms=_ms(at),
    )


async def _user(db: AsyncSession) -> User:
    user = User(id=USER_ID, email="premium@test.com", name="Premium")
    db.add(user)
    await db.flush()
    return user


class WebhookLandsDuringTheRead:
    """A RevenueCat read that answers with what it saw at ``read_at``, while a
    newer webhook (a refund) is applied before the refresh writes."""

    def __init__(self, db: AsyncSession, read_at: datetime, webhook) -> None:
        self.db = db
        self.read_at = read_at
        self.webhook = webhook

    async def get_premium(self, app_user_id: str) -> PremiumState:
        await PremiumService(self.db).handle_webhook(self.webhook)
        return PremiumState(
            active=True,
            expires_at=self.read_at + timedelta(days=30),
            product_id="gg_premium_monthly",
            read_at=self.read_at,
        )


async def test_refresh_does_not_overwrite_a_newer_webhook(db_session):
    user = await _user(db_session)
    now = datetime.now(UTC)
    await PremiumService(db_session).handle_webhook(
        _event("INITIAL_PURCHASE", at=now, expires=now + timedelta(days=30))
    )
    refund = _event(
        "EXPIRATION", at=now + timedelta(seconds=10), expires=now + timedelta(seconds=9)
    )
    rc = WebhookLandsDuringTheRead(db_session, now + timedelta(seconds=5), refund)

    after = await PremiumService(db_session, revenuecat=rc).refresh(user)

    assert is_premium(after) is False
    assert after.premium_updated_at.replace(tzinfo=UTC) == datetime.fromtimestamp(
        _ms(now + timedelta(seconds=10)) / 1000, tz=UTC
    )


class Reads:
    def __init__(self, state: PremiumState) -> None:
        self.state = state

    async def get_premium(self, app_user_id: str) -> PremiumState:
        return self.state


async def test_refresh_is_stamped_with_the_read_time(db_session):
    """A webhook for an event before the read is then stale: the read saw it."""
    user = await _user(db_session)
    read_at = datetime.now(UTC).replace(microsecond=0) - timedelta(minutes=1)
    state = PremiumState(
        active=True, expires_at=read_at + timedelta(days=30), read_at=read_at
    )

    after = await PremiumService(db_session, revenuecat=Reads(state)).refresh(user)

    assert is_premium(after) is True
    assert after.premium_updated_at.replace(tzinfo=UTC) == read_at


async def test_refresh_without_a_read_time_uses_the_time_before_the_read(db_session):
    user = await _user(db_session)
    before = datetime.now(UTC)
    state = PremiumState(active=True, expires_at=before + timedelta(days=30))

    after = await PremiumService(db_session, revenuecat=Reads(state)).refresh(user)

    stamped = after.premium_updated_at.replace(tzinfo=UTC)
    assert before - timedelta(seconds=1) <= stamped <= datetime.now(UTC)


@pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent deliveries need Postgres (SQLite has one writer)",
)
async def test_two_concurrent_deliveries_of_one_event_apply_once(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as setup:
        await _user(setup)
        await setup.commit()

    now = datetime.now(UTC)
    event = _event(
        "INITIAL_PURCHASE",
        at=now,
        expires=now + timedelta(days=30),
        event_id="evt-concurrent-1",
    )
    started = asyncio.Event()

    async def deliver(delay: bool) -> str:
        async with factory() as db, db.begin():
            if delay:
                await started.wait()
            outcome = await PremiumService(db).handle_webhook(event)
            started.set()
            # Hold the transaction open so the other delivery must wait on it.
            await asyncio.sleep(0.2 if not delay else 0)
            return outcome

    results = await asyncio.gather(deliver(False), deliver(True))

    assert sorted(results) == sorted([APPLIED, DUPLICATE])
    async with factory() as db:
        count = (
            await db.execute(select(func.count()).select_from(RevenueCatEvent))
        ).scalar_one()
        assert count == 1
        user = await db.get(User, USER_ID)
        assert is_premium(user) is True
