"""Rolling averages (PI functional requirements) and the price alert cooldown
claim (PI-03 AC 3)."""

import asyncio
import os
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import (
    CanonicalItem,
    LineItem,
    PriceAlertSent,
    PriceObservation,
    Receipt,
    User,
)
from app.services.price_alert_service import PriceAlertService
from app.services.price_service import (
    LONG_WINDOW_DAYS,
    SHORT_WINDOW_DAYS,
    PriceService,
)

USER_ID = uuid.UUID("00000000-0000-0000-0000-0000000000a1")
NOW = datetime(2026, 3, 20, 12, 0, tzinfo=UTC)


async def _setup(db: AsyncSession) -> CanonicalItem:
    db.add(User(id=USER_ID, email="avg@test.com", name="Avg"))
    await db.flush()  # before the item: Postgres checks the foreign key
    item = CanonicalItem(user_id=USER_ID, canonical_name="Organic Bananas")
    db.add(item)
    await db.flush()
    return item


async def _price(
    db: AsyncSession,
    item: CanonicalItem,
    day: date,
    price: float,
    *,
    unit: str | None = "lb",
    currency: str = "USD",
    deleted: bool = False,
) -> Receipt:
    receipt = Receipt(
        user_id=USER_ID,
        date=day,
        total=price,
        currency=currency,
        status="confirmed",
        deleted_at=NOW if deleted else None,
    )
    db.add(receipt)
    await db.flush()
    line = LineItem(
        receipt_id=receipt.id,
        raw_name="BANANAS",
        unit_price=price,
        total_price=price,
        canonical_item_id=item.id,
    )
    db.add(line)
    await db.flush()
    db.add(
        PriceObservation(
            user_id=USER_ID,
            canonical_item_id=item.id,
            receipt_id=receipt.id,
            line_item_id=line.id,
            date=day,
            unit_price=price,
            quantity=1,
            unit_of_measure=unit,
            currency=currency,
        )
    )
    await db.flush()
    return receipt


async def _average(db, item, days, **kw):
    return await PriceService(db).rolling_average(
        USER_ID,
        item.id,
        unit_of_measure=kw.get("unit", "lb"),
        currency=kw.get("currency", "USD"),
        as_of=date(2026, 3, 20),
        days=days,
        exclude_receipt_id=kw.get("exclude"),
    )


async def test_7_and_30_day_rolling_averages(db_session):
    item = await _setup(db_session)
    await _price(db_session, item, date(2026, 2, 18), 9.00)  # 30 days back: out
    await _price(db_session, item, date(2026, 2, 19), 1.00)  # 29 days back: in
    await _price(db_session, item, date(2026, 3, 13), 2.00)  # 7 days back: 30 only
    await _price(db_session, item, date(2026, 3, 14), 3.00)  # 6 days back: both
    await _price(db_session, item, date(2026, 3, 20), 4.00)  # today: both
    await _price(db_session, item, date(2026, 3, 21), 50.00)  # after as_of: out

    short = await _average(db_session, item, SHORT_WINDOW_DAYS)
    long = await _average(db_session, item, LONG_WINDOW_DAYS)

    assert (short.average, short.count) == (Decimal("3.5"), 2)
    assert (long.average, long.count) == (Decimal("2.5"), 4)


async def test_the_average_is_like_for_like_and_skips_deleted_receipts(db_session):
    item = await _setup(db_session)
    await _price(db_session, item, date(2026, 3, 10), 1.00)
    await _price(db_session, item, date(2026, 3, 11), 5.00, unit="kg")
    await _price(db_session, item, date(2026, 3, 12), 5.00, unit=None)
    await _price(db_session, item, date(2026, 3, 13), 5.00, currency="CAD")
    await _price(db_session, item, date(2026, 3, 14), 5.00, deleted=True)
    latest = await _price(db_session, item, date(2026, 3, 15), 3.00)

    lb = await _average(db_session, item, LONG_WINDOW_DAYS)
    without_latest = await _average(
        db_session, item, LONG_WINDOW_DAYS, exclude=latest.id
    )
    no_unit = await _average(db_session, item, LONG_WINDOW_DAYS, unit=None)

    assert (lb.average, lb.count) == (Decimal(2), 2)
    assert (without_latest.average, without_latest.count) == (Decimal(1), 1)
    assert (no_unit.average, no_unit.count) == (Decimal(5), 1)


async def test_an_empty_window_has_no_average(db_session):
    item = await _setup(db_session)

    result = await _average(db_session, item, LONG_WINDOW_DAYS)

    assert (result.average, result.count) == (None, 0)


@pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent claims need Postgres row locks (SQLite has one writer)",
)
async def test_two_concurrent_claims_for_one_item_alert_once(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as setup:
        item = await _setup(setup)
        await setup.commit()

    started = asyncio.Event()

    async def confirm(delay: float) -> bool:
        async with factory() as db, db.begin():
            if delay:
                await started.wait()
            claimed = await PriceAlertService(db).claim(USER_ID, item.id, NOW)
            started.set()
            # Hold the transaction open so the other claim must wait on it.
            await asyncio.sleep(0.2 if not delay else 0)
            return claimed

    results = await asyncio.gather(confirm(0), confirm(0.01))

    assert sorted(results) == [False, True]
    async with factory() as db:
        rows = (await db.execute(select(PriceAlertSent))).scalars().all()
        assert len(rows) == 1
        # And a week later the item can alert again.
        assert await PriceAlertService(db).claim(
            USER_ID, item.id, NOW + timedelta(days=7)
        )
        await db.commit()
