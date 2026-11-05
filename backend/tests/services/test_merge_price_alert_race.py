"""EC-PI 11 (DA-4): a price alert written while its item is merged, on Postgres.

A confirm claims the source item's cooldown row and writes its alert, and
holds its transaction open while the user merges the source into another
item. At READ COMMITTED the merge sees the alert only in a statement that
starts after the confirm commits: its DELETE of the source item waits on the
key-share lock the confirm's ``price_alerts_sent`` insert holds, so the alert
rewrite must come after that DELETE. Otherwise the alert opens a deleted item.
"""

import asyncio
import json
import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import Notification
from app.services.item_matching_service import ItemMatchingService
from app.services.notification_service import NotificationService
from app.services.price_alert_service import NOTIFICATION_TYPE, PriceAlertService
from tests.services.test_item_matching import USER, _receipt

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="the race needs Postgres row locks (SQLite has one writer)",
)


async def test_an_alert_written_during_a_merge_opens_the_surviving_item(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        service = ItemMatchingService(db)
        _, lines = await _receipt(db, "Cucumber", "Gherkins")
        await service.match_line_items(USER, lines)
        source, target = lines[0].canonical_item_id, lines[1].canonical_item_id
        assert source != target
        await db.commit()
    claimed = asyncio.Event()

    async def confirm() -> None:
        async with factory() as db, db.begin():
            assert await PriceAlertService(db).claim(USER, source, datetime.now(UTC))
            await NotificationService(db).create_notification(
                USER,
                NOTIFICATION_TYPE,
                "Cucumber up 20%",
                "Cucumber: was $1.00 avg, now $1.20",
                {"canonical_item_id": str(source), "store_id": None},
            )
            await db.flush()
            claimed.set()
            await asyncio.sleep(0.5)  # the merge runs while this is open

    async def merge() -> None:
        await claimed.wait()
        async with factory() as db, db.begin():
            await ItemMatchingService(db).merge(USER, source, target)

    await asyncio.wait_for(asyncio.gather(confirm(), merge()), timeout=10)

    async with factory() as db:
        [alert] = (
            (await db.execute(select(Notification).where(Notification.user_id == USER)))
            .scalars()
            .all()
        )
    assert json.loads(alert.data)["canonical_item_id"] == str(target)
