"""PI-03 AC 4 and 11 (DA-11): an item mute and a merge of that item at once.

A merge moves the source's live mute to the target (_move_price_alert_state):
it reads both mute rows, then inserts or updates the target's. A mute or an
unmute of either item that commits between that read and that write used to
hit the mute table's unique key (a 500), update a row already deleted, or
lose the mute with the deleted source. Muting and unmuting now lock the item
row first, as merge() does (lock order, DA-5: items in id order, then
suggestions; a mute locks its one item and no suggestion), so the two run
one after the other.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import CanonicalItem, PriceAlertItemMute
from app.services.item_matching_service import ItemMatchingService, ItemNotFoundError
from app.services.price_alert_service import PriceAlertService
from tests.services.lock_waits import wait_for_lock_waiters
from tests.services.test_item_matching import USER, _receipt

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="the race needs Postgres row locks (SQLite has one writer)",
)

HOLD = 0.4  # seconds the first transaction stays open


def _factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


async def _two_items(factory, *mutes: tuple[int, datetime | None]):
    """A source and a target item; ``mutes`` are (0 source / 1 target, until)."""
    async with factory() as db:
        _, lines = await _receipt(db, "Cucumber", "Gherkins")
        await ItemMatchingService(db).match_line_items(USER, lines)
        ids = [lines[0].canonical_item_id, lines[1].canonical_item_id]
        assert ids[0] != ids[1]
        for which, until in mutes:
            await PriceAlertService(db).mute_item(USER, ids[which], until)
        await db.commit()
    return ids


async def _mutes(factory) -> dict:
    async with factory() as db:
        rows = (await db.execute(select(PriceAlertItemMute))).scalars().all()
    return {row.canonical_item_id: row.muted_until for row in rows}


async def _mute_then_merge(factory, action, item_id, source, target) -> list:
    """``action`` runs on ``item_id`` and holds its transaction open while
    the merge of ``source`` into ``target`` starts."""
    done = asyncio.Event()

    async def first() -> str:
        async with factory() as db, db.begin():
            await action(PriceAlertService(db), item_id)
            done.set()
            await asyncio.sleep(HOLD)
        return "ok"

    async def merge() -> str:
        await done.wait()
        async with factory() as db, db.begin():
            await ItemMatchingService(db).merge(USER, source, target)
        return "ok"

    return list(
        await asyncio.wait_for(
            asyncio.gather(first(), merge(), return_exceptions=True), timeout=10
        )
    )


async def _mute(service: PriceAlertService, item_id) -> None:
    await service.mute_item(USER, item_id)


async def _unmute(service: PriceAlertService, item_id) -> None:
    await service.unmute_item(USER, item_id)


async def test_muting_the_target_while_a_muted_item_merges_into_it(db_engine):
    """Was a unique violation on (user, item): the merge read no target mute,
    then inserted one after the mute committed its own."""
    factory = _factory(db_engine)
    source, target = await _two_items(factory, (0, None))

    results = await _mute_then_merge(factory, _mute, target, source, target)

    assert results == ["ok", "ok"]
    assert await _mutes(factory) == {target: None}


async def test_unmuting_the_target_while_a_muted_item_merges_into_it(db_engine):
    """Was a stale update: the merge moved the end of a target mute that the
    unmute deleted meanwhile. The source's mute now lands on the target."""
    factory = _factory(db_engine)
    soon = datetime.now(UTC) + timedelta(days=5)
    later = datetime.now(UTC) + timedelta(days=10)
    source, target = await _two_items(factory, (0, later), (1, soon))

    results = await _mute_then_merge(factory, _unmute, target, source, target)

    assert results == ["ok", "ok"]
    assert await _mutes(factory) == {target: later}


async def test_muting_the_source_while_it_merges_carries_the_mute_over(db_engine):
    """Was lost: the merge missed the uncommitted mute, and deleting the
    source deleted it. The merge now waits for it and moves it."""
    factory = _factory(db_engine)
    source, target = await _two_items(factory)

    results = await _mute_then_merge(factory, _mute, source, source, target)

    assert results == ["ok", "ok"]
    assert await _mutes(factory) == {target: None}


@pytest.mark.parametrize("action", [_mute, _unmute])
async def test_muting_an_item_a_merge_is_deleting_is_not_found(db_engine, action):
    """The merge first: a mute of its source waits, then finds the item gone
    (404 at the route), never a foreign key error."""
    factory = _factory(db_engine)
    source, target = await _two_items(factory)
    merging = asyncio.Event()

    async def merge() -> str:
        async with factory() as db, db.begin():
            await ItemMatchingService(db).merge(USER, source, target)
            merging.set()
            await asyncio.sleep(HOLD)
        return "ok"

    async def mute() -> str:
        await merging.wait()
        async with factory() as db, db.begin():
            try:
                await action(PriceAlertService(db), source)
            except ItemNotFoundError:
                return "not found"
        return "ok"

    results = await asyncio.wait_for(
        asyncio.gather(merge(), mute(), return_exceptions=True), timeout=10
    )

    assert results == ["ok", "not found"]
    assert await _mutes(factory) == {}


@pytest.mark.parametrize("action", [_mute, _unmute])
async def test_a_mute_takes_its_item_lock_before_its_mute_row(db_engine, action):
    """Pins the lock: while another transaction holds the item row (as a
    merge does, FOR NO KEY UPDATE), a mute or unmute waits and has written
    nothing; it goes on once that lock is released."""
    factory = _factory(db_engine)
    source, _ = await _two_items(factory, (0, None))
    holder = factory()
    await holder.begin()
    await holder.execute(
        select(CanonicalItem.id)
        .where(CanonicalItem.id == source)
        .with_for_update(key_share=True)
    )

    async def run() -> None:
        async with factory() as db, db.begin():
            await action(PriceAlertService(db), source)

    task = asyncio.create_task(run())
    try:
        await wait_for_lock_waiters(factory, 1, timeout=3)
        waited = True
    except TimeoutError:
        waited = False
    await holder.commit()
    await holder.close()
    await asyncio.wait_for(task, timeout=10)

    assert waited
