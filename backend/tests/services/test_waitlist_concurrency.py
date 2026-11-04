"""One free year per waitlist email under concurrent redeems (V11-P5), on
Postgres only.

Two accounts (a verify-email and a claim link tapped at the same moment)
race for one waitlist email. Each request runs in its own transaction, as in
production, and both pass the "not redeemed yet" read before either inserts.
The unique key on ``waitlist_redemptions.email_hash`` must let exactly one
through: one row, one RevenueCat grant, the other told it was redeemed.

SQLite has one writer, so this skips there.
"""

from __future__ import annotations

import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import clock
from app.core.config import get_settings
from app.models.database import User, WaitlistEntry, WaitlistRedemption
from app.services.waitlist_service import (
    SOURCE_CLAIM,
    SOURCE_VERIFY_EMAIL,
    AlreadyRedeemedError,
    WaitlistService,
)
from tests.services.test_waitlist_service import CUTOFF, LAUNCHED, NOW, FakeRevenueCat

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent transactions need Postgres (SQLite has one writer)",
)


@pytest.fixture
def offer(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "premium_launched_at", LAUNCHED)
    monkeypatch.setattr(settings, "waitlist_cutoff", CUTOFF)
    monkeypatch.setattr(settings, "waitlist_email_hash_salt", "test-salt")
    monkeypatch.setattr(clock, "now", lambda: NOW)


async def test_two_accounts_racing_for_one_waitlist_email_get_one_grant(
    db_engine, offer, monkeypatch
):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        owner = User(email="member@example.com", email_verified_at=NOW, name="a")
        claimer = User(email="relay@privaterelay.appleid.com", name="b")
        db.add_all(
            [
                owner,
                claimer,
                WaitlistEntry(
                    email="member@example.com",
                    contact_created_at=CUTOFF - timedelta(days=3),
                ),
            ]
        )
        await db.commit()

    # Both requests read "not redeemed" before either inserts.
    both_checked = asyncio.Barrier(2)
    real_check = WaitlistService._email_redeemed

    async def check_then_wait(self, email_hash: str) -> bool:
        redeemed = await real_check(self, email_hash)
        await asyncio.wait_for(both_checked.wait(), timeout=5)
        return redeemed

    monkeypatch.setattr(WaitlistService, "_email_redeemed", check_then_wait)
    rc = FakeRevenueCat()

    async def redeem(user: User, source: str):
        async with factory() as db:
            return await WaitlistService(db, revenuecat=rc).redeem(
                user, "member@example.com", source=source
            )

    results = await asyncio.gather(
        redeem(owner, SOURCE_VERIFY_EMAIL),
        redeem(claimer, SOURCE_CLAIM),
        return_exceptions=True,
    )

    winners = [r for r in results if isinstance(r, WaitlistRedemption)]
    losers = [r for r in results if isinstance(r, AlreadyRedeemedError)]
    assert (len(winners), len(losers)) == (1, 1), results
    assert len(rc.grants) == 1
    assert rc.grants[0][0] == str(winners[0].user_id)
    async with factory() as db:
        count = await db.scalar(select(func.count(WaitlistRedemption.id)))
    assert count == 1
