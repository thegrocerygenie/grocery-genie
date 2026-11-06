"""PI-03 AC 4, 11 and EC-PI 1 (DA-11): a store mute and a store merge at once.

A store mute covers the store's group as the user sees it, and muting or
unmuting acts on the whole group: muting again leaves one row with the new
end, unmuting removes every row in it (PriceAlertService.mute_store,
unmute_store). Both read the group, then write. A merge of another store
into the group that commits between that read and that write used to leave
the group with a mute the user had just replaced or removed: a stale row on
the merged store, so a later end (or any mute) still silenced the group.
Muting and unmuting now take the user's store-merge lock (StoreService.
_lock_user, FOR NO KEY UPDATE on the user row) first, as merge and unmerge
do, so each runs wholly before or after a merge. They lock no item or
suggestion, so the DA-5 order (items, then suggestions) is untouched.
"""

import asyncio
import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import PriceAlertStoreMute, User
from app.services.price_alert_service import PriceAlertService
from app.services.store_service import StoreService
from tests.conftest import DEV_USER_ID as USER
from tests.services.lock_waits import wait_for_lock_waiters
from tests.services.test_store_service import _shop

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="the race needs Postgres row locks (SQLite has one writer)",
)

SOON = datetime(2030, 1, 8, tzinfo=UTC)


def _factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


async def _stores(factory):
    """Loblaws (the group the user acts on) and Superstore, muted forever."""
    async with factory() as db:
        loblaws = await _shop(db, USER, "Loblaws")
        superstore = await _shop(db, USER, "Real Canadian Superstore")
        await PriceAlertService(db).mute_store(USER, superstore.id)
        await db.commit()
    return loblaws.id, superstore.id


async def _mutes(factory) -> dict:
    async with factory() as db:
        rows = (await db.execute(select(PriceAlertStoreMute))).scalars().all()
    return {row.store_id: row.muted_until for row in rows}


async def _merge_while(factory, superstore, loblaws, action) -> list:
    """Merges Superstore into Loblaws and holds that transaction open until
    ``action`` (on Loblaws) is waiting on a lock, or has finished."""

    async def merge() -> str:
        async with factory() as db, db.begin():
            await StoreService(db).merge(USER, superstore, loblaws)
            merged.set()
            done = asyncio.ensure_future(acting)
            waiting = asyncio.ensure_future(wait_for_lock_waiters(factory, 1))
            await asyncio.wait([done, waiting], return_when=asyncio.FIRST_COMPLETED)
            waiting.cancel()
        return "ok"

    async def act() -> str:
        await merged.wait()
        async with factory() as db, db.begin():
            await action(PriceAlertService(db), loblaws)
        return "ok"

    merged = asyncio.Event()
    acting = asyncio.ensure_future(act())
    return list(
        await asyncio.wait_for(
            asyncio.gather(merge(), acting, return_exceptions=True), timeout=15
        )
    )


async def test_muting_a_group_while_a_muted_store_merges_into_it(db_engine):
    """The new end is the group's only end: the merged store's forever mute
    goes, as it does when the merge came first."""
    factory = _factory(db_engine)
    loblaws, superstore = await _stores(factory)

    async def mute(service, store_id):
        await service.mute_store(USER, store_id, SOON)

    results = await _merge_while(factory, superstore, loblaws, mute)

    assert results == ["ok", "ok"]
    assert await _mutes(factory) == {loblaws: SOON}


async def test_unmuting_a_group_while_a_muted_store_merges_into_it(db_engine):
    """Unmuting clears the whole group, the merged store's mute too."""
    factory = _factory(db_engine)
    loblaws, superstore = await _stores(factory)
    async with factory() as db:
        await PriceAlertService(db).mute_store(USER, loblaws, SOON)
        await db.commit()

    async def unmute(service, store_id):
        await service.unmute_store(USER, store_id)

    results = await _merge_while(factory, superstore, loblaws, unmute)

    assert results == ["ok", "ok"]
    assert await _mutes(factory) == {}


@pytest.mark.parametrize("action", ["mute", "unmute"])
async def test_a_store_mute_takes_the_users_merge_lock_first(db_engine, action):
    """Pins the lock: while another transaction holds the user's store-merge
    lock (as a store merge does), a mute or unmute waits and has written
    nothing; it goes on once that lock is released."""
    factory = _factory(db_engine)
    loblaws, _ = await _stores(factory)
    holder = factory()
    await holder.begin()
    await holder.execute(
        select(User.id).where(User.id == USER).with_for_update(key_share=True)
    )

    async def run() -> None:
        async with factory() as db, db.begin():
            service = PriceAlertService(db)
            if action == "mute":
                await service.mute_store(USER, loblaws, SOON)
            else:
                await service.unmute_store(USER, loblaws)

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
    expected = SOON if action == "mute" else None
    assert (await _mutes(factory)).get(loblaws) == expected
