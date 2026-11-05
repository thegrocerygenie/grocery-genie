"""PI-02 AC 9 (DA-5): two answers to one suggestion at once, on Postgres.

The "Same item?" prompt can be answered on two devices, or twice by a double
tap. The first answer wins and the other gets ItemMatchConflictError (409),
which the app passes over: never two merges, and never "rejected" recorded
for items that were merged.
"""

import asyncio
import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import CanonicalItem, ItemMatchSuggestion
from app.services.item_matching_service import (
    ItemMatchConflictError,
    ItemMatchingService,
)
from tests.services.test_item_matching import USER, _receipt

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent answers need Postgres row locks (SQLite has one writer)",
)


async def _pending(factory) -> ItemMatchSuggestion:
    async with factory() as db:
        service = ItemMatchingService(db)
        _, first = await _receipt(db, "Cucumber")
        await service.match_line_items(USER, first)
        _, second = await _receipt(db, "CUCUMBERS ENG")
        await service.match_line_items(USER, second)
        [suggestion] = await service.list_suggestions(USER)
        await db.commit()
        return suggestion


async def _race(factory, suggestion_id, first: str, second: str) -> list:
    """Runs ``first`` and holds its transaction open while ``second`` starts."""
    started = asyncio.Event()

    async def answer(action: str, waits: bool):
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
            service = ItemMatchingService(db)
            try:
                if action == "accept":
                    await service.accept_suggestion(USER, suggestion_id)
                else:
                    await service.reject_suggestion(USER, suggestion_id)
                outcome = "ok"
            except ItemMatchConflictError:
                outcome = "conflict"
            if not waits:
                started.set()
                await asyncio.sleep(0.3)  # the other answer must wait on this one
            return outcome

    async def late(action: str):
        await started.wait()
        await asyncio.sleep(0.05)
        return await answer(action, waits=True)

    return list(await asyncio.gather(answer(first, waits=False), late(second)))


@pytest.mark.parametrize(
    ("first", "second"),
    [("accept", "accept"), ("accept", "reject"), ("reject", "accept")],
)
async def test_two_answers_at_once_resolve_once(db_engine, first, second):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    suggestion = await _pending(factory)

    outcomes = await _race(factory, suggestion.id, first, second)

    assert outcomes == ["ok", "conflict"]
    async with factory() as db:
        items = (await db.execute(select(CanonicalItem))).scalars().all()
        rows = (await db.execute(select(ItemMatchSuggestion))).scalars().all()
    if first == "accept":
        # One merge: one item left, and no suggestion marked rejected.
        assert [i.id for i in items] == [suggestion.suggested_item_id]
        assert rows == []
    else:
        assert len(items) == 2
        assert [r.status for r in rows] == ["rejected"]


@pytest.mark.parametrize("accept_first", [True, False])
async def test_an_answer_and_a_merge_of_its_item_at_once_never_deadlock(
    db_engine, accept_first
):
    """Lock order: items in id order, then suggestions, on both paths. An
    accept racing a merge of the suggested item into a third one finishes
    either way: the accept wins, or it finds the suggestion moved (409)."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    suggestion = await _pending(factory)
    async with factory() as db:
        _, lines = await _receipt(db, "Gherkins")
        await ItemMatchingService(db).match_line_items(USER, lines)
        third = lines[0].canonical_item_id
        await db.commit()
    started = asyncio.Event()

    async def accept(waits: bool) -> str:
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
                await asyncio.sleep(0.05)
            try:
                await ItemMatchingService(db).accept_suggestion(USER, suggestion.id)
                outcome = "ok"
            except ItemMatchConflictError:
                outcome = "conflict"
            if not waits:
                started.set()
                await asyncio.sleep(0.3)
            return outcome

    async def merge(waits: bool) -> str:
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
                await asyncio.sleep(0.05)
            await ItemMatchingService(db).merge(
                USER, suggestion.suggested_item_id, third
            )
            if not waits:
                started.set()
                await asyncio.sleep(0.3)
            return "ok"

    results = await asyncio.wait_for(
        asyncio.gather(accept(not accept_first), merge(accept_first)), timeout=10
    )

    assert results == (["ok", "ok"] if accept_first else ["conflict", "ok"])
    async with factory() as db:
        ids = {i.id for i in (await db.execute(select(CanonicalItem))).scalars()}
    assert third in ids
    assert suggestion.suggested_item_id not in ids


async def test_accept_takes_its_item_locks_first_in_id_order(db_engine):
    """Pins the lock order. A manual merge the other way round (the suggested
    item into the asked one) races an accept of the suggestion. Two holders of
    shared locks on the items, released highest id first, line the waits up:

    - accept locking its items in id order waits behind the merge and then
      finds the suggestion merged away (409);
    - accept skipping its item locks would hold the suggestion row while the
      merge, holding the items, needs it: a deadlock;
    - accept locking them highest id first would hold the highest while the
      merge, holding the lowest, needs it: a deadlock.
    """
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    suggestion = await _pending(factory)
    low, high = sorted([suggestion.item_id, suggestion.suggested_item_id])

    async def share(item_id) -> AsyncSession:
        db = factory()
        await db.begin()
        await db.execute(
            select(CanonicalItem.id)
            .where(CanonicalItem.id == item_id)
            .with_for_update(read=True)
        )
        return db

    hold_high = await share(high)
    hold_low = await share(low)

    async def merge() -> str:
        async with factory() as db, db.begin():
            await ItemMatchingService(db).merge(
                USER, suggestion.suggested_item_id, suggestion.item_id
            )
            return "ok"

    async def accept() -> str:
        async with factory() as db, db.begin():
            try:
                await ItemMatchingService(db).accept_suggestion(USER, suggestion.id)
                return "ok"
            except ItemMatchConflictError:
                return "conflict"

    merging = asyncio.create_task(merge())
    await asyncio.sleep(0.3)  # the merge waits on the lowest id
    accepting = asyncio.create_task(accept())
    await asyncio.sleep(0.3)  # the accept waits too, on whichever it locks
    await hold_high.commit()
    await hold_high.close()
    await asyncio.sleep(0.3)
    await hold_low.commit()
    await hold_low.close()

    results = await asyncio.wait_for(
        asyncio.gather(merging, accepting, return_exceptions=True), timeout=15
    )

    assert results == ["ok", "conflict"]
    async with factory() as db:
        ids = {i.id for i in (await db.execute(select(CanonicalItem))).scalars()}
    assert ids == {suggestion.item_id}
