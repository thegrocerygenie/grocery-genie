"""A receipt edit racing a split or a merge of one of its lines' items, on
Postgres (DA-6).

An edit rebuilds the receipt's prices from its lines (sync_receipt). A split
or merge that moved a line after the edit read it left the edit's price on
the line's old item (a split), or failed the rebuild on the deleted item
inside its savepoint, so the receipt kept its old prices (a merge).

update_receipt locks its lines' items first, in id order, before it changes
anything, as split_lines and merge() lock theirs (DA-5). So of an edit and a
split or merge of the same item, one waits for the other: every price ends
on its line's item, with the edit's values, and nothing deadlocks.
"""

import asyncio
import logging
import os
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import (
    CanonicalItem,
    Category,
    LineItem,
    PriceObservation,
    Receipt,
    User,
)
from app.models.schemas import LineItemCorrection, ReceiptUpdateRequest
from app.services.item_matching_service import ItemMatchingService, SplitPart
from app.services.price_service import PriceService
from app.services.receipt_service import ReceiptService
from tests.services.test_item_matching import USER, _receipt
from tests.services.test_split_concurrency import _setup

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent edits need Postgres row locks (SQLite has one writer)",
)

NEW_DATE = date(2026, 3, 11)
NEW_PRICE = Decimal("3.50")


def _edit(kind: str, line: LineItem) -> ReceiptUpdateRequest:
    """A date edit changes no line; a price edit changes the moving one."""
    if kind == "date":
        return ReceiptUpdateRequest(date=NEW_DATE)
    return ReceiptUpdateRequest(
        items=[LineItemCorrection(id=line.id, total_price=float(NEW_PRICE))]
    )


async def _move(db, op: str, item, target, line) -> None:
    service = ItemMatchingService(db)
    if op == "split":
        await service.split_lines(USER, item.id, [SplitPart("Olive oil 3L", [line.id])])
    else:
        await service.merge(USER, item.id, target.id)


async def _prices_follow_lines(factory, count: int) -> None:
    """Each of the ``count`` lines has one price: on its item, at its unit
    price, on its receipt's date."""
    async with factory() as db:
        rows = (
            await db.execute(
                select(LineItem, Receipt.date, PriceObservation)
                .join(Receipt, LineItem.receipt_id == Receipt.id)
                .outerjoin(
                    PriceObservation, PriceObservation.line_item_id == LineItem.id
                )
            )
        ).all()
    assert len(rows) == count
    for line_item, receipt_date, price in rows:
        assert price is not None, f"{line_item.raw_name}: no price"
        assert (price.canonical_item_id, price.unit_price, price.date) == (
            line_item.canonical_item_id,
            line_item.unit_price,
            receipt_date,
        )


async def _check(factory, op: str, edit: str, target, line) -> None:
    """The move and the edit both took effect, and every price follows its
    line."""
    async with factory() as db:
        moved = await db.get(LineItem, line.id)
        receipt = await db.get(Receipt, line.receipt_id)
        if op == "split":
            expected = await db.scalar(
                select(CanonicalItem.id).where(
                    CanonicalItem.canonical_name == "Olive oil 3L"
                )
            )
        else:
            expected = target.id

    assert moved.canonical_item_id == expected
    if edit == "date":
        assert receipt.date == NEW_DATE
    else:
        assert moved.unit_price == NEW_PRICE
    await _prices_follow_lines(factory, 4)


@pytest.mark.parametrize("edit_first", [True, False], ids=["edit-first", "edit-last"])
@pytest.mark.parametrize("edit", ["date", "price"])
@pytest.mark.parametrize("op", ["split", "merge"])
async def test_an_edit_and_a_move_of_its_line_at_once(
    db_engine, caplog, op, edit, edit_first
):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    item, target, lines = await _setup(factory)
    line = lines[2]
    started = asyncio.Event()

    async def run(step, waits: bool) -> str:
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
                await asyncio.sleep(0.05)
            await step(db)
            if not waits:
                started.set()
                await asyncio.sleep(0.3)  # the other runs while this is open
        return "ok"

    async def edit_receipt(db) -> None:
        await ReceiptService(db).update_receipt(
            line.receipt_id, USER, _edit(edit, line)
        )

    async def move(db) -> None:
        await _move(db, op, item, target, line)

    with caplog.at_level(logging.ERROR):
        results = await asyncio.wait_for(
            asyncio.gather(
                run(edit_receipt, waits=not edit_first),
                run(move, waits=edit_first),
                return_exceptions=True,
            ),
            timeout=10,
        )

    assert results == ["ok", "ok"]
    assert [r.getMessage() for r in caplog.records] == []
    await _check(factory, op, edit, target, line)


@pytest.mark.parametrize("op", ["split", "merge"])
async def test_an_edit_takes_its_item_locks_before_any_line(db_engine, caplog, op):
    """Pins the lock order. A holder of the item's lock lines up a split (or
    merge) of it, then a price edit of a line on it, behind the lock. When it
    lets go:

    - the edit locking its items first waits behind the move, then finds its
      line on the item it moved to, and records the new price there;
    - an edit changing the line before it locks the item (checked by locking
      in sync_receipt, after the edit's flush) holds the line the move needs
      while it waits for the item the move holds: Postgres reports a
      deadlock.
    """
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    item, target, lines = await _setup(factory)
    line = lines[2]

    hold = factory()
    await hold.begin()
    await hold.execute(
        select(CanonicalItem.id)
        .where(CanonicalItem.id == item.id)
        .with_for_update(key_share=True)
    )

    async def move() -> str:
        async with factory() as db, db.begin():
            await _move(db, op, item, target, line)
        return "ok"

    async def edit_receipt() -> str:
        async with factory() as db, db.begin():
            await ReceiptService(db).update_receipt(
                line.receipt_id, USER, _edit("price", line)
            )
        return "ok"

    with caplog.at_level(logging.ERROR):
        moving = asyncio.create_task(move())
        await asyncio.sleep(0.3)  # the move waits on the item
        editing = asyncio.create_task(edit_receipt())
        await asyncio.sleep(0.3)  # the edit waits too, or runs through
        await hold.commit()
        await hold.close()
        results = await asyncio.wait_for(
            asyncio.gather(moving, editing, return_exceptions=True), timeout=15
        )

    assert results == ["ok", "ok"]
    assert [r.getMessage() for r in caplog.records] == []
    await _check(factory, op, "price", target, line)


@pytest.mark.parametrize("edit_first", [True, False], ids=["edit-first", "edit-last"])
async def test_an_edit_and_an_unlink_of_its_line_at_once(db_engine, caplog, edit_first):
    """Unlinking a name (split_alias) moves lines too, so it locks its item
    first as well, and an edit of a receipt with that name waits for it."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        service = ItemMatchingService(db)
        for name in ["Avocado", "Avocados"]:
            receipt, [line] = await _receipt(db, name)
            await service.match_line_items(USER, [line])
            await db.refresh(receipt, ["line_items"])
            await PriceService(db).sync_receipt(receipt)
        item = await db.get(CanonicalItem, line.canonical_item_id)
        await db.refresh(item, ["aliases"])
        [plural] = [a for a in item.aliases if a.normalized_name == "avocados"]
        await db.commit()
    started = asyncio.Event()

    async def run(step, waits: bool) -> str:
        async with factory() as db, db.begin():
            if waits:
                await started.wait()
                await asyncio.sleep(0.05)
            await step(db)
            if not waits:
                started.set()
                await asyncio.sleep(0.3)
        return "ok"

    async def edit_receipt(db) -> None:
        await ReceiptService(db).update_receipt(
            line.receipt_id, USER, _edit("date", line)
        )

    async def unlink(db) -> None:
        await ItemMatchingService(db).split_alias(USER, item.id, plural.id)

    with caplog.at_level(logging.ERROR):
        results = await asyncio.wait_for(
            asyncio.gather(
                run(edit_receipt, waits=not edit_first),
                run(unlink, waits=edit_first),
                return_exceptions=True,
            ),
            timeout=10,
        )

    assert results == ["ok", "ok"]
    assert [r.getMessage() for r in caplog.records] == []
    async with factory() as db:
        moved = await db.get(LineItem, line.id)
    assert moved.canonical_item_id not in (None, item.id)
    await _prices_follow_lines(factory, 2)


async def test_an_edit_takes_the_user_lock_before_its_item_locks(db_engine, caplog):
    """A custom-category correction locks the user row (ensure_usable) before
    the lines' items. A confirm takes the user row first, then may update the
    item it links a line to (its unit, _link), so an edit holding that item
    while it waited for the user row could deadlock with it.

    A holder of the user row lock lines up the edit. The edit holds no item
    yet, so a split of its item goes through meanwhile; then the edit finds
    its line on the new item.
    """
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    item, target, lines = await _setup(factory)
    line = lines[2]
    async with factory() as db:
        pantry = Category(name="Pantry", user_id=USER, is_default=False)
        db.add(pantry)
        await db.commit()

    hold = factory()
    await hold.begin()
    await hold.execute(
        select(User.id).where(User.id == USER).with_for_update(key_share=True)
    )

    async def edit_receipt() -> str:
        correction = LineItemCorrection(
            id=line.id, total_price=float(NEW_PRICE), category_id=pantry.id
        )
        async with factory() as db, db.begin():
            await ReceiptService(db).update_receipt(
                line.receipt_id, USER, ReceiptUpdateRequest(items=[correction])
            )
        return "ok"

    async def split() -> str:
        async with factory() as db, db.begin():
            await _move(db, "split", item, target, line)
        return "ok"

    with caplog.at_level(logging.ERROR):
        editing = asyncio.create_task(edit_receipt())
        await asyncio.sleep(0.3)  # the edit waits on the user row
        try:
            splitting = await asyncio.wait_for(split(), timeout=3)
        finally:
            await hold.commit()
            await hold.close()
        results = [splitting, await asyncio.wait_for(editing, timeout=10)]

    assert results == ["ok", "ok"]
    assert [r.getMessage() for r in caplog.records] == []
    await _check(factory, "split", "price", target, line)
    async with factory() as db:
        assert (await db.get(LineItem, line.id)).category_id == pantry.id


async def test_a_confirm_waits_for_no_item_after_linking_its_lines(db_engine, caplog):
    """A confirm links its lines, then fills in a linked item's missing unit
    (_link). It skips an item another transaction holds: waiting for it there
    would take an item after lines, against the lock order. A receipt edit
    holding that item (lock_line_items) could be waiting for one of the
    confirm's lines, by a category correction of the same name
    (_retroactive_category_update): a deadlock.

    A holder of the item's lock stands in for the edit. The confirm goes
    through while it holds, links its line to the item, and leaves the unit
    for a later line.
    """
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        first, [flour] = await _receipt(db, "Flour")
        await ItemMatchingService(db).match_line_items(USER, [flour])
        await db.refresh(first, ["line_items"])
        await PriceService(db).sync_receipt(first)
        pending = Receipt(
            user_id=USER, date=first.date, status="pending_review", currency="USD"
        )
        db.add(pending)
        await db.flush()
        for position, (name, unit) in enumerate([("Cinnamon", None), ("FLOUR", "kg")]):
            db.add(
                LineItem(
                    receipt_id=pending.id,
                    raw_name=name,
                    position=position,
                    quantity=1,
                    unit_price=2.0,
                    total_price=2.0,
                    unit_of_measure=unit,
                )
            )
        await db.commit()
    item_id = flour.canonical_item_id

    hold = factory()
    await hold.begin()
    await hold.execute(
        select(CanonicalItem.id)
        .where(CanonicalItem.id == item_id)
        .with_for_update(key_share=True)
    )

    async def confirm() -> str:
        async with factory() as db, db.begin():
            await ReceiptService(db).update_receipt(
                pending.id, USER, ReceiptUpdateRequest(status="confirmed")
            )
        return "ok"

    with caplog.at_level(logging.ERROR):
        try:
            result = await asyncio.wait_for(confirm(), timeout=3)
        finally:
            await hold.commit()
            await hold.close()

    assert result == "ok"
    assert [r.getMessage() for r in caplog.records] == []
    async with factory() as db:
        linked = await db.scalar(
            select(LineItem.canonical_item_id).where(
                LineItem.receipt_id == pending.id, LineItem.raw_name == "FLOUR"
            )
        )
        item = await db.get(CanonicalItem, item_id)
    assert linked == item_id
    assert item.unit_of_measure is None
    await _prices_follow_lines(factory, 3)
