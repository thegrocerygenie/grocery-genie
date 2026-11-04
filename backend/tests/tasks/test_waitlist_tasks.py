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
from app.services.waitlist_source import WaitlistContact, WaitlistSourceError
from app.tasks.waitlist_tasks import (
    deliver_claim_link,
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


# -- the claim link, sent by the worker -----------------------------------------

EARLY = CUTOFF - timedelta(days=1)


@pytest.fixture
def claim_emails(monkeypatch) -> list[dict]:
    from app.services import email as email_service

    sent: list[dict] = []

    async def _send(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(email_service, "send_waitlist_claim_email", _send)
    return sent


async def test_the_claim_task_sends_the_link_only_to_a_listed_email(
    factory, offer, claim_emails
):
    user = await _add_user(factory, "relay@privaterelay.appleid.com")
    async with factory() as db:
        db.add(WaitlistEntry(email="member@example.com", contact_created_at=EARLY))
        await db.commit()

    assert await deliver_claim_link(factory, user.id, "member@example.com") is True
    assert await deliver_claim_link(factory, user.id, "stranger@example.com") is False

    assert [m["to"] for m in claim_emails] == ["member@example.com"]
    async with factory() as db:
        stored = await db.get(User, user.id)
        assert stored.waitlist_claim_email == "member@example.com"
        assert stored.waitlist_claim_token_hash is not None


async def test_the_claim_task_swallows_a_resend_failure(
    factory, offer, monkeypatch, caplog
):
    from app.services import email as email_service

    async def _down(**kwargs) -> None:
        raise RuntimeError("Resend answered 500")

    monkeypatch.setattr(email_service, "send_waitlist_claim_email", _down)
    user = await _add_user(factory, "relay@privaterelay.appleid.com")
    async with factory() as db:
        db.add(WaitlistEntry(email="member@example.com", contact_created_at=EARLY))
        await db.commit()

    assert await deliver_claim_link(factory, user.id, "member@example.com") is False
    assert "member@example.com" not in caplog.text


def test_the_claim_task_is_registered():
    from app.tasks.celery_app import celery_app

    celery_app.loader.import_default_modules()
    assert "app.tasks.waitlist_tasks.send_waitlist_claim" in celery_app.tasks


# -- the Resend audience's contacts, deleted when the window closes (plan 83) ---


class FakeAudienceAdmin:
    """The Resend audience: list a page of contact ids, delete one."""

    def __init__(self, count: int, *, fail_after: int | None = None) -> None:
        self.contacts = [f"c{i}" for i in range(count)]
        self.deleted: list[str] = []
        self.lists = 0
        self.fail_after = fail_after

    async def list_contact_ids(self, limit: int) -> list[str]:
        self.lists += 1
        return self.contacts[:limit]

    async def delete_contact(self, contact_id: str) -> bool:
        if self.fail_after is not None and len(self.deleted) >= self.fail_after:
            raise WaitlistSourceError("Resend answered 500")
        if contact_id not in self.contacts:
            return False
        self.contacts.remove(contact_id)
        self.deleted.append(contact_id)
        return True


async def test_purge_deletes_the_resend_contacts_in_batches_once_closed(
    factory, offer, monkeypatch, caplog
):
    import logging

    caplog.set_level(logging.INFO)
    audience = FakeAudienceAdmin(250)
    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=90))

    result = await purge_after_window(factory, audience, page_size=100)

    assert result.resend_contacts_deleted == 250
    assert audience.contacts == []
    assert audience.lists == 4  # three pages, then an empty one
    # Only counts are logged.
    assert "c0" not in caplog.text and "@" not in caplog.text

    # Idempotent: a rerun finds nothing left and deletes nothing.
    again = await purge_after_window(factory, audience, page_size=100)
    assert again.resend_contacts_deleted == 0


async def test_purge_leaves_the_resend_audience_while_the_window_is_open(
    factory, offer
):
    audience = FakeAudienceAdmin(3)

    result = await purge_after_window(factory, audience)

    assert result.resend_contacts_deleted == 0
    assert audience.lists == 0 and len(audience.contacts) == 3


async def test_purge_leaves_the_resend_audience_without_a_launch_date(
    factory, monkeypatch
):
    monkeypatch.setattr(get_settings(), "premium_launched_at", None)
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(days=3650))
    audience = FakeAudienceAdmin(3)

    result = await purge_after_window(factory, audience)

    assert result.resend_contacts_deleted == 0
    assert audience.lists == 0


async def test_a_failed_resend_delete_stops_the_run_and_a_rerun_finishes(
    factory, offer, monkeypatch
):
    async with factory() as db:
        db.add(WaitlistEntry(email="a@example.com", contact_created_at=CUTOFF))
        await db.commit()
    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=91))
    audience = FakeAudienceAdmin(5, fail_after=2)

    first = await purge_after_window(factory, audience)

    # The backend copy is gone even though Resend failed part way.
    assert first.entries == 1 and first.resend_contacts_deleted == 2
    assert first.resend_failed is True
    assert len(audience.contacts) == 3

    audience.fail_after = None
    second = await purge_after_window(factory, audience)
    assert second.resend_contacts_deleted == 3 and second.resend_failed is False
    assert audience.contacts == []


async def test_purge_caps_the_deletes_in_one_run(factory, offer, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=90))
    audience = FakeAudienceAdmin(30)

    result = await purge_after_window(factory, audience, page_size=10, max_deletes=20)

    assert result.resend_contacts_deleted == 20
    assert len(audience.contacts) == 10


def test_the_audience_key_falls_back_to_the_sending_key(monkeypatch):
    from app.tasks.waitlist_tasks import get_audience_source

    settings = get_settings()
    monkeypatch.setattr(settings, "resend_waitlist_audience_id", "aud_1")
    monkeypatch.setattr(settings, "resend_api_key", "re_send")
    monkeypatch.setattr(settings, "resend_audience_api_key", "")
    assert get_audience_source().api_key == "re_send"

    monkeypatch.setattr(settings, "resend_audience_api_key", "re_full")
    assert get_audience_source().api_key == "re_full"

    monkeypatch.setattr(settings, "resend_api_key", "")
    assert get_audience_source().api_key == "re_full"
