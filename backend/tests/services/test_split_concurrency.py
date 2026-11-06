"""PI-02 AC 13, 14 (DA-6): a split by line racing a merge or an accept, on
Postgres.

split_lines locks its item first (_lock_items), before it reads or moves a
line, a price or a name, as merge() and accept_suggestion() lock theirs. So
of a split and a merge of the same item, one waits for the other: either the
split moves its lines and the merge takes the rest, or the merge goes first
and the split finds the item gone (404). Never a deadlock, and every price
belongs to exactly one item.
"""

import asyncio
import os

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import (
    CanonicalItem,
    ItemMatchSuggestion,
    LineItem,
    PriceObservation,
    Receipt,
)
from app.services.item_matching_service import (
    ItemMatchConflictError,
    ItemMatchingService,
    ItemNotFoundError,
    SplitPart,
)
from app.services.price_service import PriceService
from tests.services.lock_waits import wait_for_lock_waiters
from tests.services.test_item_matching import USER, _receipt

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent splits need Postgres row locks (SQLite has one writer)",
)


async def _setup(factory) -> tuple[CanonicalItem, CanonicalItem, list]:
    """An item with three "Olive oil" lines (each with its price), another
    item to merge it into, and the lines."""
    async with factory() as db:
        service = ItemMatchingService(db)
        lines = []
        for _ in range(3):
            receipt, [line] = await _receipt(db, "Olive oil")
            await service.match_line_items(USER, [line])
            await db.refresh(receipt, ["line_items"])
            await PriceService(db).sync_receipt(receipt)
            lines.append(line)
        receipt, [other] = await _receipt(db, "Paprika")
        await service.match_line_items(USER, [other])
        await db.refresh(receipt, ["line_items"])
        await PriceService(db).sync_receipt(receipt)
        await db.commit()
        item = await db.get(CanonicalItem, lines[0].canonical_item_id)
        target = await db.get(CanonicalItem, other.canonical_item_id)
        return item, target, lines


async def _prices_follow_lines(factory) -> None:
    """Every price is on its line's item, and no line has two."""
    async with factory() as db:
        rows = (
            await db.execute(
                select(PriceObservation.canonical_item_id, LineItem.canonical_item_id)
                .join(LineItem, PriceObservation.line_item_id == LineItem.id)
                .join(Receipt, LineItem.receipt_id == Receipt.id)
            )
        ).all()
        assert rows and all(price == line for price, line in rows)
        count = await db.scalar(select(func.count()).select_from(PriceObservation))
        assert count == 4


@pytest.mark.parametrize("split_first", [True, False])
async def test_a_split_and_a_merge_of_its_item_at_once(db_engine, split_first):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    item, target, lines = await _setup(factory)
    started = asyncio.Event()

    async def split(waits: bool) -> str:
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
                await asyncio.sleep(0.05)
            try:
                await ItemMatchingService(db).split_lines(
                    USER, item.id, [SplitPart("Olive oil 3L", [lines[2].id])]
                )
                outcome = "ok"
            except ItemNotFoundError:
                outcome = "gone"
            if not waits:
                started.set()
                await asyncio.sleep(0.3)  # the merge must wait on this
            return outcome

    async def merge(waits: bool) -> str:
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
                await asyncio.sleep(0.05)
            await ItemMatchingService(db).merge(USER, item.id, target.id)
            if not waits:
                started.set()
                await asyncio.sleep(0.3)
            return "ok"

    results = await asyncio.wait_for(
        asyncio.gather(split(not split_first), merge(split_first)), timeout=10
    )

    assert results == (["ok", "ok"] if split_first else ["gone", "ok"])
    async with factory() as db:
        items = {
            i.canonical_name: i.id
            for i in (await db.execute(select(CanonicalItem))).scalars()
        }
        moved = await db.get(LineItem, lines[2].id)
    if split_first:
        assert set(items) == {"Olive oil 3L", "Paprika"}
        assert moved.canonical_item_id == items["Olive oil 3L"]
    else:
        assert set(items) == {"Paprika"}
        assert moved.canonical_item_id == target.id
    await _prices_follow_lines(factory)


async def test_split_takes_its_item_lock_before_any_line(db_engine):
    """Pins the lock order. A holder of a shared lock on the item lines up a
    merge of it, then a split of it, behind the lock. When it lets go:

    - the split locking its item first waits behind the merge, which moves
      every line and deletes the item; the split then finds it gone (404);
    - a split moving its lines before locking the item (checked by moving the
      _lock_items call below the line updates) holds a line the merge needs
      while it waits for the item the merge holds: Postgres reports a
      deadlock.
    """
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    item, target, lines = await _setup(factory)

    hold = factory()
    await hold.begin()
    await hold.execute(
        select(CanonicalItem.id)
        .where(CanonicalItem.id == item.id)
        .with_for_update(read=True)
    )

    async def merge() -> str:
        async with factory() as db, db.begin():
            await ItemMatchingService(db).merge(USER, item.id, target.id)
            return "ok"

    async def split() -> str:
        async with factory() as db, db.begin():
            try:
                await ItemMatchingService(db).split_lines(
                    USER, item.id, [SplitPart("Olive oil 3L", [lines[2].id])]
                )
                return "ok"
            except ItemNotFoundError:
                return "gone"

    merging = asyncio.create_task(merge())
    await wait_for_lock_waiters(factory, 1)  # the merge waits on the item
    splitting = asyncio.create_task(split())
    await wait_for_lock_waiters(factory, 2)  # the split waits too, behind it
    await hold.commit()
    await hold.close()

    results = await asyncio.wait_for(
        asyncio.gather(merging, splitting, return_exceptions=True), timeout=15
    )

    assert results == ["ok", "gone"]
    await _prices_follow_lines(factory)


async def test_a_split_and_an_accept_of_its_item_at_once(db_engine):
    """An accept merging the item away racing a split of it: the split waits
    for the accept's item lock and finds the item gone, or goes first."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        service = ItemMatchingService(db)
        for name in ["Cucumber", "CUCUMBERS ENG", "CUCUMBERS ENG"]:
            receipt, [line] = await _receipt(db, name)
            await service.match_line_items(USER, [line])
            await db.refresh(receipt, ["line_items"])
            await PriceService(db).sync_receipt(receipt)
        [suggestion] = await service.list_suggestions(USER)
        asked = suggestion.item_id
        asked_lines = (
            (
                await db.execute(
                    select(LineItem.id).where(LineItem.canonical_item_id == asked)
                )
            )
            .scalars()
            .all()
        )
        await db.commit()
    started = asyncio.Event()

    async def accept() -> str:
        async with factory() as db, db.begin():
            await ItemMatchingService(db).accept_suggestion(USER, suggestion.id)
            started.set()
            await asyncio.sleep(0.3)
            return "ok"

    async def split() -> str:
        await started.wait()
        async with factory() as db, db.begin():
            try:
                await ItemMatchingService(db).split_lines(
                    USER, asked, [SplitPart("English cucumber", [asked_lines[0]])]
                )
                return "ok"
            except ItemNotFoundError:
                return "gone"

    results = await asyncio.wait_for(asyncio.gather(accept(), split()), timeout=10)

    assert results == ["ok", "gone"]
    async with factory() as db:
        lines_left = (
            await db.execute(
                select(func.count())
                .select_from(LineItem)
                .where(LineItem.canonical_item_id == suggestion.suggested_item_id)
            )
        ).scalar_one()
    assert lines_left == 3


async def test_a_split_moving_a_question_then_its_accept(db_engine):
    """A split moving the line that raised a question, then an accept of it
    waiting behind the split: the question now pairs other items, so the
    accept gets 409 and merges nothing the user did not see."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        service = ItemMatchingService(db)
        lines = []
        for name in ["Cucumber", "CUCUMBERS ENG", "CUCUMBERS ENG"]:
            receipt, [line] = await _receipt(db, name)
            await service.match_line_items(USER, [line])
            await db.refresh(receipt, ["line_items"])
            await PriceService(db).sync_receipt(receipt)
            lines.append(line)
        [suggestion] = await service.list_suggestions(USER)
        await db.commit()
    started = asyncio.Event()

    async def split() -> str:
        async with factory() as db, db.begin():
            await ItemMatchingService(db).split_lines(
                USER, suggestion.item_id, [SplitPart("English", [lines[1].id])]
            )
            started.set()
            await asyncio.sleep(0.3)
            return "ok"

    async def accept() -> str:
        await started.wait()
        async with factory() as db, db.begin():
            try:
                await ItemMatchingService(db).accept_suggestion(USER, suggestion.id)
                return "ok"
            except ItemMatchConflictError:
                return "conflict"

    results = await asyncio.wait_for(asyncio.gather(split(), accept()), timeout=10)

    assert results == ["ok", "conflict"]
    async with factory() as db:
        left = (
            await db.execute(
                select(func.count())
                .select_from(LineItem)
                .where(LineItem.canonical_item_id == suggestion.item_id)
            )
        ).scalar_one()
        moved = await db.get(ItemMatchSuggestion, suggestion.id)
    assert left == 1
    assert moved.status == "pending" and moved.item_id != suggestion.item_id
