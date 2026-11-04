"""The waitlist tasks (V11-P5): the launch backfill (copy the audience, match
every existing account), the grant retry, and the purge when the claim
window closes (decisions #11, #13)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import clock
from app.core.config import get_settings
from app.models.database import User, WaitlistEntry, WaitlistRedemption
from app.services.waitlist_service import GRANTED, PENDING, hash_waitlist_email
from app.services.waitlist_source import WaitlistContact
from app.tasks.waitlist_tasks import (
    import_export,
    purge_after_window,
    retry_pending_grants,
    sync_and_match,
)
from tests.services.test_waitlist_service import (
    CUTOFF,
    LAUNCHED,
    NOW,
    FakeRevenueCat,
)


@pytest.fixture
def factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
def offer(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "premium_launched_at", LAUNCHED)
    monkeypatch.setattr(settings, "waitlist_cutoff", CUTOFF)
    monkeypatch.setattr(settings, "waitlist_email_hash_salt", "test-salt")
    monkeypatch.setattr(clock, "now", lambda: NOW)


class FakeAudience:
    def __init__(self, contacts: list[WaitlistContact]) -> None:
        self.contacts = contacts
        self.calls = 0

    async def list_contacts(self) -> list[WaitlistContact]:
        self.calls += 1
        return self.contacts


def _contact(email: str, **kw) -> WaitlistContact:
    return WaitlistContact(
        email=email, created_at=kw.get("created", CUTOFF - timedelta(days=5))
    )


async def _add_user(factory, email: str, *, verified: bool = True) -> User:
    async with factory() as db:
        user = User(
            email=email,
            name="u",
            email_verified_at=NOW - timedelta(days=3) if verified else None,
        )
        db.add(user)
        await db.commit()
        return user


async def _count(factory, model) -> int:
    async with factory() as db:
        return await db.scalar(select(func.count()).select_from(model))


async def test_launch_backfill_copies_the_audience_and_matches_existing_accounts(
    factory, offer
):
    a = await _add_user(factory, "a@example.com")
    await _add_user(factory, "b@example.com", verified=False)
    await _add_user(factory, "c@example.com")  # not on the waitlist
    audience = FakeAudience([_contact("A@example.com"), _contact("b@example.com")])
    rc = FakeRevenueCat()

    result = await sync_and_match(factory, audience, rc)

    assert result.synced and result.added == 2 and result.matched == 1
    assert rc.grants and rc.grants[0][0] == str(a.id)
    assert await _count(factory, WaitlistEntry) == 2


async def test_backfill_without_an_audience_matches_the_copy_already_there(
    factory, offer
):
    # The one-off CSV export was imported; no API key for the audience.
    await _add_user(factory, "a@example.com")
    imported = await import_export(
        factory, "email,created_at,unsubscribed\na@example.com,2026-11-01,true\n"
    )
    rc = FakeRevenueCat()

    result = await sync_and_match(factory, None, rc)

    assert imported.added == 1
    assert not result.synced and result.matched == 1


async def test_nothing_is_copied_or_matched_after_the_window(
    factory, offer, monkeypatch
):
    await _add_user(factory, "a@example.com")
    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=91))
    audience = FakeAudience([_contact("a@example.com")])
    rc = FakeRevenueCat()

    result = await sync_and_match(factory, audience, rc)

    assert audience.calls == 0 and result.matched == 0
    assert rc.grants == []
    assert await _count(factory, WaitlistEntry) == 0


async def test_retry_grants_pending_redemptions(factory, offer):
    user = await _add_user(factory, "a@example.com")
    async with factory() as db:
        db.add(
            WaitlistRedemption(
                email_hash=hash_waitlist_email("a@example.com"),
                user_id=user.id,
                status=PENDING,
                source="verify_email",
                matched_at=NOW - timedelta(hours=1),
                grant_expires_at=NOW + timedelta(days=364),
                attempts=1,
                last_attempt_at=NOW - timedelta(hours=1),
            )
        )
        await db.commit()
    rc = FakeRevenueCat()

    granted = await retry_pending_grants(factory, rc)

    assert granted == 1
    async with factory() as db:
        row = (await db.execute(select(WaitlistRedemption))).scalar_one()
        assert row.status == GRANTED and row.attempts == 2


async def test_purge_after_the_window_deletes_the_waitlist_and_unlinked_hashes(
    factory, offer, monkeypatch
):
    kept_user = await _add_user(factory, "kept@example.com")
    async with factory() as db:
        db.add_all(
            [
                WaitlistEntry(email="a@example.com", contact_created_at=CUTOFF),
                WaitlistRedemption(
                    email_hash="h-kept", user_id=kept_user.id, status=GRANTED
                ),
                # A deleted account's redemption, unlinked (decision #13).
                WaitlistRedemption(email_hash="h-gone", user_id=None, status=GRANTED),
            ]
        )
        claimer = await db.get(User, kept_user.id)
        claimer.waitlist_claim_email = "x@example.com"
        claimer.waitlist_claim_token_hash = "t"
        await db.commit()

    # Still open: nothing goes.
    assert (await purge_after_window(factory)).entries == 0
    assert await _count(factory, WaitlistEntry) == 1

    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=90))
    result = await purge_after_window(factory)

    assert (result.entries, result.unlinked_redemptions) == (1, 1)
    assert await _count(factory, WaitlistEntry) == 0
    async with factory() as db:
        hashes = (await db.execute(select(WaitlistRedemption.email_hash))).scalars()
        # The grant stays with its account, so one year per email still holds.
        assert list(hashes) == ["h-kept"]
        user = await db.get(User, kept_user.id)
        assert user.waitlist_claim_email is None
        assert user.waitlist_claim_token_hash is None


async def test_purge_does_nothing_without_a_launch_date(factory, monkeypatch):
    monkeypatch.setattr(get_settings(), "premium_launched_at", None)
    async with factory() as db:
        db.add(WaitlistEntry(email="a@example.com", contact_created_at=CUTOFF))
        await db.commit()

    assert (await purge_after_window(factory)).entries == 0
    assert await _count(factory, WaitlistEntry) == 1


def test_beat_runs_the_waitlist_tasks():
    from app.tasks.celery_app import celery_app

    celery_app.loader.import_default_modules()
    tasks = {entry["task"] for entry in celery_app.conf.beat_schedule.values()}

    for name in (
        "app.tasks.waitlist_tasks.sync_and_match_waitlist",
        "app.tasks.waitlist_tasks.retry_waitlist_grants",
        "app.tasks.waitlist_tasks.purge_waitlist_after_window",
    ):
        assert name in tasks
        assert name in celery_app.tasks
