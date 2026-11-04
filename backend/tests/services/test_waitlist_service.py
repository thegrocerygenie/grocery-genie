"""The waitlist's free year of Premium (V11-P5, decisions #2, #7, #9-#13).

An account qualifies when its verified email, trimmed and lowercased, equals
a waitlist contact's created before the cut-off, while the 90-day claim
window is open. Each match grants a 12-month RevenueCat promotional
entitlement, once per waitlist email, ever.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.entitlements import is_premium
from app.models.database import User, WaitlistEntry, WaitlistRedemption
from app.services.revenuecat_client import (
    PremiumState,
    RevenueCatRejectedError,
    RevenueCatUnavailableError,
)
from app.services.waitlist_service import (
    FAILED,
    GRANTED,
    PENDING,
    WaitlistService,
    add_months,
    hash_waitlist_email,
)

NOW = datetime(2027, 1, 10, 12, 0, tzinfo=UTC)
LAUNCHED = datetime(2027, 1, 1, tzinfo=UTC)
CUTOFF = datetime(2026, 12, 15, tzinfo=UTC)


class FakeRevenueCat:
    """RevenueCat's REST API, in memory: promotional grants and reads."""

    def __init__(self, *, fail_grants: int = 0) -> None:
        self.grants: list[tuple[str, datetime]] = []
        self.calls = 0
        self.fail_grants = fail_grants
        # A 4xx RevenueCat answers to every grant (status code), or None.
        self.reject_with: int | None = None
        # Seconds each grant / read takes: a slow RevenueCat.
        self.grant_delay = 0.0
        self.read_delay = 0.0
        # Runs inside the grant, before it is recorded.
        self.during_grant = None

    async def grant_promotional(self, app_user_id: str, end_time: datetime) -> None:
        self.calls += 1
        if self.during_grant is not None:
            hook, self.during_grant = self.during_grant, None
            await hook()
        if self.grant_delay:
            await asyncio.sleep(self.grant_delay)
        if self.reject_with is not None:
            raise RevenueCatRejectedError(
                f"{self.reject_with} from RevenueCat", status_code=self.reject_with
            )
        if self.fail_grants:
            self.fail_grants -= 1
            raise RevenueCatUnavailableError("503 from RevenueCat")
        self.grants.append((app_user_id, end_time))

    async def get_premium(self, app_user_id: str) -> PremiumState:
        if self.read_delay:
            await asyncio.sleep(self.read_delay)
        ends = [end for uid, end in self.grants if uid == app_user_id]
        if not ends:
            return PremiumState(active=False, read_at=clock.now())
        return PremiumState(
            active=True,
            expires_at=max(ends),
            product_id="rc_promo_premium_custom",
            read_at=clock.now(),
        )


@pytest.fixture
def offer(monkeypatch) -> None:
    """The claim window open (launched 9 days ago) and a cut-off set."""
    settings = get_settings()
    monkeypatch.setattr(settings, "premium_launched_at", LAUNCHED)
    monkeypatch.setattr(settings, "waitlist_cutoff", CUTOFF)
    monkeypatch.setattr(settings, "waitlist_email_hash_salt", "test-salt")
    monkeypatch.setattr(clock, "now", lambda: NOW)


async def _user(
    db: AsyncSession, email: str, *, verified: bool = True, **fields
) -> User:
    user = User(
        email=email,
        name="Member",
        email_verified_at=NOW - timedelta(days=1) if verified else None,
        **fields,
    )
    db.add(user)
    await db.flush()
    return user


async def _entry(
    db: AsyncSession,
    email: str,
    *,
    created: datetime = CUTOFF - timedelta(days=30),
    unsubscribed: bool = False,
) -> WaitlistEntry:
    entry = WaitlistEntry(
        email=email, contact_created_at=created, unsubscribed=unsubscribed
    )
    db.add(entry)
    await db.flush()
    return entry


async def _redemptions(db: AsyncSession) -> list[WaitlistRedemption]:
    return list((await db.execute(select(WaitlistRedemption))).scalars().all())


async def test_verified_account_on_the_waitlist_gets_twelve_months(db_session, offer):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat()

    redemption = await WaitlistService(db_session, revenuecat=rc).match_account(
        user, source="verify_email"
    )

    assert redemption is not None and redemption.status == GRANTED
    assert rc.grants == [(str(user.id), datetime(2028, 1, 10, 12, 0, tzinfo=UTC))]
    # The grant is read back from RevenueCat: the user is Premium now.
    await db_session.refresh(user)
    assert is_premium(user)


async def test_email_is_matched_trimmed_and_lowercased(db_session, offer):
    # Sign-up stores emails normalized; an older account may not be.
    user = await _user(db_session, "  Member@Example.COM ")
    await _entry(db_session, "member@example.com")

    redemption = await WaitlistService(
        db_session, revenuecat=FakeRevenueCat()
    ).match_account(user, source="backfill")

    assert redemption is not None


async def test_unverified_email_does_not_match(db_session, offer):
    user = await _user(db_session, "member@example.com", verified=False)
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat()

    assert (
        await WaitlistService(db_session, revenuecat=rc).match_account(
            user, source="backfill"
        )
        is None
    )
    assert rc.grants == []
    assert await _redemptions(db_session) == []


async def test_contact_created_after_the_cutoff_does_not_qualify(db_session, offer):
    user = await _user(db_session, "late@example.com")
    await _entry(db_session, "late@example.com", created=CUTOFF + timedelta(seconds=1))

    assert (
        await WaitlistService(db_session, revenuecat=FakeRevenueCat()).match_account(
            user, source="backfill"
        )
        is None
    )


async def test_no_cutoff_set_yet_every_contact_qualifies(
    db_session, offer, monkeypatch
):
    # The site has not switched to the App Store yet, so nobody joined after.
    monkeypatch.setattr(get_settings(), "waitlist_cutoff", None)
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com", created=NOW - timedelta(days=1))

    assert (
        await WaitlistService(db_session, revenuecat=FakeRevenueCat()).match_account(
            user, source="backfill"
        )
        is not None
    )


async def test_unsubscribed_contact_still_qualifies(db_session, offer):
    # Decision #10: unsubscribing stops emails, not the offer.
    user = await _user(db_session, "quiet@example.com")
    await _entry(db_session, "quiet@example.com", unsubscribed=True)

    redemption = await WaitlistService(
        db_session, revenuecat=FakeRevenueCat()
    ).match_account(user, source="backfill")

    assert redemption is not None and redemption.status == GRANTED


@pytest.mark.parametrize(
    "now",
    [
        LAUNCHED - timedelta(seconds=1),  # Premium not launched yet
        LAUNCHED + timedelta(days=90),  # the window has closed
    ],
)
async def test_no_grant_outside_the_claim_window(db_session, offer, monkeypatch, now):
    monkeypatch.setattr(clock, "now", lambda: now)
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat()

    assert (
        await WaitlistService(db_session, revenuecat=rc).match_account(
            user, source="backfill"
        )
        is None
    )
    assert rc.grants == []


async def test_last_moment_of_the_window_still_matches(db_session, offer, monkeypatch):
    monkeypatch.setattr(
        clock, "now", lambda: LAUNCHED + timedelta(days=90, microseconds=-1)
    )
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")

    assert (
        await WaitlistService(db_session, revenuecat=FakeRevenueCat()).match_account(
            user, source="backfill"
        )
        is not None
    )


async def test_premium_not_launched_means_no_window(db_session, offer, monkeypatch):
    monkeypatch.setattr(get_settings(), "premium_launched_at", None)
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")

    assert (
        await WaitlistService(db_session, revenuecat=FakeRevenueCat()).match_account(
            user, source="backfill"
        )
        is None
    )


async def test_hide_my_email_does_not_match(db_session, offer):
    user = await _user(
        db_session, "x7k2p9@privaterelay.appleid.com", apple_subject="apple-1"
    )
    await _entry(db_session, "member@example.com")

    assert (
        await WaitlistService(db_session, revenuecat=FakeRevenueCat()).match_account(
            user, source="social_sign_in"
        )
        is None
    )


async def test_matching_twice_grants_once(db_session, offer):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat()
    service = WaitlistService(db_session, revenuecat=rc)

    await service.match_account(user, source="verify_email")
    again = await service.match_account(user, source="email_change")

    assert again is None
    assert len(rc.grants) == 1
    assert len(await _redemptions(db_session)) == 1


async def test_one_free_year_per_waitlist_email_across_accounts(db_session, offer):
    # The first account later moves to another email; a second account takes
    # the waitlist email and verifies it. The waitlist email is spent.
    first = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat()
    service = WaitlistService(db_session, revenuecat=rc)
    assert await service.match_account(first, source="verify_email") is not None
    first.email = "moved@example.com"
    await db_session.flush()

    second = await _user(db_session, "member@example.com")
    assert await service.match_account(second, source="verify_email") is None
    assert [uid for uid, _ in rc.grants] == [str(first.id)]


async def test_redemption_stores_only_a_salted_hash_of_the_email(db_session, offer):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")

    redemption = await WaitlistService(
        db_session, revenuecat=FakeRevenueCat()
    ).match_account(user, source="backfill")

    assert redemption is not None
    assert redemption.email_hash == hash_waitlist_email("member@example.com")
    assert "member" not in redemption.email_hash
    # Salted: the same email hashes differently under another salt.
    assert hash_waitlist_email("member@example.com", salt="other") != (
        redemption.email_hash
    )


async def test_revenuecat_failure_leaves_the_redemption_pending_and_retries(
    db_session, offer
):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat(fail_grants=1)
    service = WaitlistService(db_session, revenuecat=rc)

    redemption = await service.match_account(user, source="verify_email")

    assert redemption is not None and redemption.status == PENDING
    assert redemption.attempts == 1
    assert redemption.last_error == "revenuecat_unavailable"
    await db_session.refresh(user)
    assert not is_premium(user)

    # The retry grants with the same end date: 12 months from the match.
    granted = await service.retry_pending(older_than=timedelta(0))

    assert granted == 1
    await db_session.refresh(redemption)
    assert redemption.status == GRANTED and redemption.attempts == 2
    assert rc.grants == [(str(user.id), datetime(2028, 1, 10, 12, 0, tzinfo=UTC))]


async def test_without_a_revenuecat_key_the_redemption_waits(db_session, offer):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")

    redemption = await WaitlistService(db_session, revenuecat=None).match_account(
        user, source="verify_email"
    )

    assert redemption is not None and redemption.status == PENDING
    assert redemption.last_error == "revenuecat_not_configured"


async def test_retry_skips_recent_attempts(db_session, offer):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat(fail_grants=1)
    service = WaitlistService(db_session, revenuecat=rc)
    await service.match_account(user, source="verify_email")

    assert await service.retry_pending(older_than=timedelta(minutes=5)) == 0
    assert rc.grants == []


async def test_match_emits_analytics(db_session, offer):
    events: list[tuple[str, dict]] = []

    class Recorder:
        def emit(self, name, props, user_id):
            events.append((name, props))

    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")

    await WaitlistService(
        db_session, analytics=Recorder(), revenuecat=FakeRevenueCat()
    ).match_account(user, source="verify_email")

    names = [name for name, _ in events]
    assert ("waitlist_offer_matched", {"source": "verify_email"}) in events
    assert (
        "waitlist_offer_granted",
        {"source": "verify_email", "attempts": 1},
    ) in events
    assert "premium_status_changed" in names


async def test_match_all_backfills_every_existing_account(db_session, offer):
    a = await _user(db_session, "a@example.com")
    b = await _user(db_session, "b@example.com")
    await _user(db_session, "c@example.com", verified=False)
    await _user(db_session, "d@example.com")  # not on the waitlist
    for email in ("a@example.com", "b@example.com", "c@example.com"):
        await _entry(db_session, email)
    rc = FakeRevenueCat()

    matched = await WaitlistService(db_session, revenuecat=rc).match_all()

    assert matched == 2
    assert sorted(uid for uid, _ in rc.grants) == sorted([str(a.id), str(b.id)])
    count = await db_session.scalar(select(func.count(WaitlistRedemption.id)))
    assert count == 2


@pytest.mark.parametrize(
    ("start", "months", "end"),
    [
        (datetime(2027, 1, 10, tzinfo=UTC), 12, datetime(2028, 1, 10, tzinfo=UTC)),
        # 29 February has no twin next year: the last day of February.
        (datetime(2028, 2, 29, tzinfo=UTC), 12, datetime(2029, 2, 28, tzinfo=UTC)),
        (datetime(2027, 1, 31, tzinfo=UTC), 1, datetime(2027, 2, 28, tzinfo=UTC)),
    ],
)
def test_add_months(start, months, end):
    assert add_months(start, months) == end


def test_hash_is_stable_and_normalizes():
    salt = "s"
    assert hash_waitlist_email(" A@B.com ", salt=salt) == hash_waitlist_email(
        "a@b.com", salt=salt
    )


async def test_user_id_is_unique_per_redemption(db_session, offer):
    # One free year per account too: a second waitlist email can't stack.
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    await _entry(db_session, "other@example.com")
    service = WaitlistService(db_session, revenuecat=FakeRevenueCat())
    await service.match_account(user, source="verify_email")

    assert await service.has_redemption(user.id)
    assert uuid.UUID(str(user.id))


# -- the retry: stamped, capped, final on a 4xx, closed with the window --------


async def _pending(
    db_session, monkeypatch, *, rc: FakeRevenueCat
) -> WaitlistRedemption:
    """A redemption left pending by a failed first grant."""
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc.fail_grants = 1
    redemption = await WaitlistService(db_session, revenuecat=rc).match_account(
        user, source="verify_email"
    )
    assert redemption is not None and redemption.status == PENDING
    return redemption


async def test_pending_row_is_stamped_before_the_first_grant(
    db_session, db_engine, offer
):
    """The row is committed before RevenueCat is called; a beat retry running
    meanwhile must see a fresh attempt and leave it alone (no double call)."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    await db_session.commit()
    rc = FakeRevenueCat()
    seen: dict = {}

    async def beat_runs_now() -> None:
        async with factory() as other:
            row = (await other.execute(select(WaitlistRedemption))).scalar_one()
            seen["last_attempt_at"] = row.last_attempt_at
            seen["retried"] = await WaitlistService(
                other, revenuecat=rc
            ).retry_pending()

    rc.during_grant = beat_runs_now

    await WaitlistService(db_session, revenuecat=rc).match_account(
        user, source="verify_email"
    )

    assert seen["last_attempt_at"] is not None
    assert seen["retried"] == 0
    assert rc.calls == 1


async def test_retry_backs_off_and_gives_up_only_after_14_days(
    db_session, offer, monkeypatch
):
    """A RevenueCat outage must not cost a member matched in time the year:
    retries back off (15 min, doubling, at most 6 h apart) for 14 days from
    the match, far past 24 attempts, and only then stop."""
    rc = FakeRevenueCat()
    redemption = await _pending(db_session, monkeypatch, rc=rc)  # attempt 1 at NOW
    rc.fail_grants = 10_000
    service = WaitlistService(db_session, revenuecat=rc)

    async def retry_at(delta: timedelta) -> None:
        monkeypatch.setattr(clock, "now", lambda: NOW + delta)
        await service.retry_pending()

    await retry_at(timedelta(minutes=10))  # 15 min after attempt 1: not yet
    assert rc.calls == 1
    await retry_at(timedelta(minutes=16))
    assert rc.calls == 2
    await retry_at(timedelta(minutes=40))  # 30 min after attempt 2: not yet
    assert rc.calls == 2
    await retry_at(timedelta(minutes=47))
    assert rc.calls == 3

    # Every 6 hours at most once the backoff is long: well past 24 attempts.
    for hour in range(6, 13 * 24, 6):
        await retry_at(timedelta(hours=hour, minutes=1))
    await db_session.refresh(redemption)
    assert redemption.status == PENDING
    assert redemption.attempts > 24

    await retry_at(timedelta(days=14))
    await db_session.refresh(redemption)
    assert redemption.status == FAILED
    assert redemption.last_error == "gave_up_after_14_days"


async def test_a_long_backoff_is_capped_at_six_hours(db_session, offer, monkeypatch):
    rc = FakeRevenueCat()
    redemption = await _pending(db_session, monkeypatch, rc=rc)
    redemption.attempts = 20
    await db_session.commit()
    service = WaitlistService(db_session, revenuecat=rc)

    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(hours=5, minutes=59))
    assert await service.retry_pending() == 0
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(hours=6, minutes=1))
    assert await service.retry_pending() == 1


async def test_a_revenuecat_4xx_is_final(db_session, offer, monkeypatch):
    rc = FakeRevenueCat()
    redemption = await _pending(db_session, monkeypatch, rc=rc)
    rc.reject_with = 404
    service = WaitlistService(db_session, revenuecat=rc)

    assert await service.retry_pending(older_than=timedelta(0)) == 0
    await service.retry_pending(older_than=timedelta(0))

    await db_session.refresh(redemption)
    assert redemption.status == FAILED
    assert redemption.last_error == "revenuecat_rejected_404"
    assert rc.calls == 2  # the first failed grant, then the 404; no more


async def test_a_4xx_on_the_first_grant_is_final_too(db_session, offer):
    user = await _user(db_session, "member@example.com")
    await _entry(db_session, "member@example.com")
    rc = FakeRevenueCat()
    rc.reject_with = 400

    redemption = await WaitlistService(db_session, revenuecat=rc).match_account(
        user, source="verify_email"
    )

    assert redemption is not None and redemption.status == FAILED
    assert redemption.last_error == "revenuecat_rejected_400"


async def test_retry_keeps_going_after_the_window_closes(
    db_session, offer, monkeypatch
):
    """Decision #9: a member matched inside the window is owed the year. The
    window is checked at the match only; the retry grants after it closes,
    with the end time set at the match."""
    matched = LAUNCHED + timedelta(days=89)
    monkeypatch.setattr(clock, "now", lambda: matched)
    rc = FakeRevenueCat()
    redemption = await _pending(db_session, monkeypatch, rc=rc)
    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=91))

    granted = await WaitlistService(db_session, revenuecat=rc).retry_pending()

    assert granted == 1
    await db_session.refresh(redemption)
    assert redemption.status == GRANTED
    assert rc.grants == [(str(redemption.user_id), add_months(matched, 12))]


async def test_a_grant_whose_end_time_has_passed_is_recorded_not_sent(
    db_session, offer, monkeypatch
):
    rc = FakeRevenueCat()
    redemption = await _pending(db_session, monkeypatch, rc=rc)
    redemption.grant_expires_at = NOW - timedelta(minutes=1)
    await db_session.commit()

    await WaitlistService(db_session, revenuecat=rc).retry_pending(
        older_than=timedelta(0)
    )

    await db_session.refresh(redemption)
    assert redemption.status == FAILED
    assert redemption.last_error == "grant_end_passed"
    assert rc.calls == 1  # only the first, failed attempt


async def test_a_final_failure_is_logged_at_error_level(
    db_session, offer, monkeypatch, caplog
):
    import logging

    rc = FakeRevenueCat()
    await _pending(db_session, monkeypatch, rc=rc)
    rc.reject_with = 403
    caplog.set_level(logging.WARNING)

    await WaitlistService(db_session, revenuecat=rc).retry_pending(
        older_than=timedelta(0)
    )

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors and "revenuecat_rejected_403" in errors[0].getMessage()
