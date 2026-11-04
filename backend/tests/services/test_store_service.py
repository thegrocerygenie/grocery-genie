"""Store normalization and per-user store groups (EC Price Intelligence 1).

"Loblaws", "LOBLAWS #1234" and "Loblaws - 1234" are one store for everyone:
normalization drops branch numbers and punctuation. A different banner
("REAL CANADIAN SUPERSTORE") is joined only by the user's own merge, which
changes how that user's prices group and nobody else's (decision D3).
"""

import uuid

import pytest
from sqlalchemy import func, select

from app.models.database import Store, UserStoreAlias
from app.services.store_service import (
    StoreAlreadyMergedError,
    StoreNotFoundError,
    StoreService,
    normalize_store_name,
)
from tests.conftest import DEV_USER_ID, USER_B_ID, ensure_user


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Loblaws", "loblaws"),
        ("LOBLAWS", "loblaws"),
        ("  Loblaws  ", "loblaws"),
        ("LOBLAWS #1234", "loblaws"),
        ("Loblaws # 1234", "loblaws"),
        ("Loblaws#1234", "loblaws"),
        ("Loblaws - 1234", "loblaws"),
        ("Loblaws Store 1234", "loblaws"),
        ("Loblaws Store #0042", "loblaws"),
        ("Loblaws No. 12", "loblaws"),
        ("Loblaws No #12", "loblaws"),
        ("Cafe No 5", "cafe no 5"),
        ("Loblaws.", "loblaws"),
        ("LOBLAWS, INC.", "loblaws inc"),
        ("Trader Joe's", "trader joes"),
        ("TRADER JOE’S #552", "trader joes"),
        ("Métro", "metro"),
        ("FreshCo", "freshco"),
        ("Whole  Foods   Market", "whole foods market"),
        # A number that is part of the name stays.
        ("7-Eleven", "7 eleven"),
        ("7-ELEVEN #33456", "7 eleven"),
        ("Food 4 Less", "food 4 less"),
        # A different banner is not normalization's job: the user merges it.
        ("REAL CANADIAN SUPERSTORE", "real canadian superstore"),
        ("Forever 21", "forever 21"),
        ("Costco 2", "costco 2"),
        # Precision first: a bare trailing number may be part of the name
        # ("Bar 1802"), so it stays; the user merges "LOBLAWS 1234" by hand.
        ("LOBLAWS 1234", "loblaws 1234"),
        ("Dollarama 1000", "dollarama 1000"),
        # A marker with nothing before it is the whole name.
        ("#1234", "1234"),
        ("Store 12", "store 12"),
    ],
)
def test_normalize_store_name(raw, expected):
    assert normalize_store_name(raw) == expected


@pytest.mark.parametrize(
    ("a", "b"),
    [
        # A branch word is stripped only at the end, never inside a name.
        ("Number 1 Chinese", "Chinese"),
        ("Unit 7 Cafe", "Loc 8 Cafe"),
        ("Location 1 Pizza", "Pizza"),
        ("No. 12 Bakery", "Bakery"),
        # A bare trailing number is part of the name (years, street numbers).
        ("Bar 1920", "Bar 1802"),
        ("Bar 1802", "Bar"),
        ("Pizza 1990", "Pizza"),
        ("Bodega 101", "Bodega"),
        ("Forever 21", "Forever"),
        ("Costco 2", "Costco"),
        # "No" without its period, and "Number", can be part of a name.
        ("Cafe No 5", "Cafe"),
        ("Bodega No 1", "Bodega"),
        ("Diner Number 9", "Diner"),
    ],
)
def test_different_stores_never_normalize_together(a, b):
    """A false group cannot be undone by the user (rows are shared); a missed
    one costs a manual merge. So normalization favours precision."""
    assert normalize_store_name(a) != normalize_store_name(b)


def test_the_normalized_name_fits_the_column():
    assert len(normalize_store_name("x" * 400)) == 255
    assert len(normalize_store_name("a " * 300)) <= 255


def test_the_migration_normalized_existing_stores_the_same_way():
    """Migration 20261104_0019 rewrote stores.normalized_name with a frozen
    copy of the function; at that revision the two agree."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).parents[2]
        / "migrations/versions/20261104_0019_store_normalization_merge.py"
    )
    spec = importlib.util.spec_from_file_location("m0019", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for raw in [
        "LOBLAWS #1234",
        "Loblaws - 1234",
        "Trader Joe's",
        "Métro",
        "#1",
        "Number 1 Chinese",
        "Bar 1802",
        "Loblaws Store #0042",
        "Cafe No 5",
        "Loblaws No. 12",
        "Diner Number 9",
        "x" * 400,
    ]:
        assert module._normalize(raw) == normalize_store_name(raw)


async def test_branch_numbers_and_punctuation_find_one_store(db_session):
    service = StoreService(db_session)

    first = await service.find_or_create("Loblaws")
    for variant in ["LOBLAWS #1234", "Loblaws - 1234", "loblaws."]:
        assert (await service.find_or_create(variant)).id == first.id

    count = await db_session.scalar(select(func.count()).select_from(Store))
    assert count == 1
    # The shared row keeps the name it was first seen with.
    assert first.name == "Loblaws"


async def test_older_rows_that_now_normalize_together_group_together(db_session):
    """Rows saved before normalization (or by two concurrent receipts) are
    never deleted: they group under the oldest row with their name."""
    await ensure_user(db_session, DEV_USER_ID)
    a = Store(name="Loblaws", normalized_name="loblaws")
    db_session.add(a)
    await db_session.flush()
    b = Store(name="LOBLAWS #1234", normalized_name="loblaws")
    db_session.add(b)
    await db_session.flush()

    groups = await StoreService(db_session).groups(DEV_USER_ID, [a.id, b.id])

    assert groups[a.id] == groups[b.id]
    assert groups[a.id].id in {a.id, b.id}


async def _shop(db_session, user_id: uuid.UUID, name: str) -> Store:
    from datetime import date

    from app.models.database import Receipt

    await ensure_user(db_session, user_id)
    store = await StoreService(db_session).find_or_create(name)
    db_session.add(
        Receipt(
            user_id=user_id,
            store_id=store.id,
            store_name=name,
            date=date(2026, 3, 1),
            status="confirmed",
            currency="USD",
        )
    )
    await db_session.flush()
    return store


async def test_a_merge_groups_only_that_users_stores(db_session):
    loblaws = await _shop(db_session, DEV_USER_ID, "Loblaws")
    rcss = await _shop(db_session, DEV_USER_ID, "REAL CANADIAN SUPERSTORE")
    await _shop(db_session, USER_B_ID, "Loblaws")
    await _shop(db_session, USER_B_ID, "REAL CANADIAN SUPERSTORE")
    service = StoreService(db_session)

    await service.merge(DEV_USER_ID, rcss.id, loblaws.id)

    mine = await service.groups(DEV_USER_ID, [loblaws.id, rcss.id])
    assert mine[rcss.id].id == loblaws.id
    assert mine[rcss.id].name == "Loblaws"
    theirs = await service.groups(USER_B_ID, [loblaws.id, rcss.id])
    assert theirs[rcss.id].id == rcss.id
    assert theirs[rcss.id].name == "REAL CANADIAN SUPERSTORE"
    # The shared rows are untouched.
    await db_session.refresh(rcss)
    assert rcss.name == "REAL CANADIAN SUPERSTORE"
    assert rcss.normalized_name == "real canadian superstore"


async def test_merging_a_group_moves_its_merged_stores_too(db_session):
    a = await _shop(db_session, DEV_USER_ID, "A Mart")
    b = await _shop(db_session, DEV_USER_ID, "B Mart")
    c = await _shop(db_session, DEV_USER_ID, "C Mart")
    service = StoreService(db_session)

    await service.merge(DEV_USER_ID, a.id, b.id)
    await service.merge(DEV_USER_ID, b.id, c.id)

    groups = await service.groups(DEV_USER_ID, [a.id, b.id, c.id])
    assert {g.id for g in groups.values()} == {c.id}
    # One level deep: unmerging B leaves A with C.
    await service.unmerge(DEV_USER_ID, b.id)
    groups = await service.groups(DEV_USER_ID, [a.id, b.id, c.id])
    assert groups[a.id].id == c.id
    assert groups[b.id].id == b.id


async def test_a_store_cannot_be_merged_into_its_own_group(db_session):
    a = await _shop(db_session, DEV_USER_ID, "A Mart")
    b = await _shop(db_session, DEV_USER_ID, "B Mart")
    service = StoreService(db_session)
    await service.merge(DEV_USER_ID, a.id, b.id)

    with pytest.raises(StoreAlreadyMergedError):
        await service.merge(DEV_USER_ID, a.id, a.id)
    with pytest.raises(StoreAlreadyMergedError):
        await service.merge(DEV_USER_ID, b.id, a.id)


async def test_only_stores_the_user_shopped_at_can_be_merged(db_session):
    mine = await _shop(db_session, DEV_USER_ID, "A Mart")
    theirs = await _shop(db_session, USER_B_ID, "B Mart")
    service = StoreService(db_session)

    with pytest.raises(StoreNotFoundError):
        await service.merge(DEV_USER_ID, mine.id, theirs.id)
    with pytest.raises(StoreNotFoundError):
        await service.merge(DEV_USER_ID, theirs.id, mine.id)
    with pytest.raises(StoreNotFoundError):
        await service.merge(DEV_USER_ID, uuid.uuid4(), mine.id)
    count = await db_session.scalar(select(func.count()).select_from(UserStoreAlias))
    assert count == 0


async def test_a_branch_of_a_shopped_store_counts_as_shopped(db_session):
    """The group id the API hands out can be another row of the same name."""
    await ensure_user(db_session, DEV_USER_ID)
    older = Store(name="Loblaws", normalized_name="loblaws")
    db_session.add(older)
    await db_session.flush()
    newer = Store(name="LOBLAWS #9", normalized_name="loblaws")
    db_session.add(newer)
    await db_session.flush()
    from datetime import date

    from app.models.database import Receipt

    db_session.add(
        Receipt(
            user_id=DEV_USER_ID,
            store_id=newer.id,
            date=date(2026, 3, 1),
            status="confirmed",
            currency="USD",
        )
    )
    other = await _shop(db_session, DEV_USER_ID, "FreshCo")
    service = StoreService(db_session)

    await service.merge(DEV_USER_ID, other.id, older.id)

    groups = await service.groups(DEV_USER_ID, [other.id, newer.id])
    assert groups[other.id] == groups[newer.id]


async def test_a_store_on_only_deleted_receipts_is_not_shopped(db_session):
    """A receipt in Recently Deleted is not one the user still has."""
    from datetime import UTC, datetime

    from app.models.database import Receipt

    kept = await _shop(db_session, DEV_USER_ID, "A Mart")
    gone = await _shop(db_session, DEV_USER_ID, "B Mart")
    receipt = await db_session.scalar(
        select(Receipt).where(Receipt.store_id == gone.id)
    )
    receipt.deleted_at = datetime.now(UTC)
    await db_session.flush()

    with pytest.raises(StoreNotFoundError):
        await StoreService(db_session).merge(DEV_USER_ID, gone.id, kept.id)


async def test_a_group_is_named_as_the_users_own_receipts_name_it(db_session):
    """The shared row keeps the name its first receipt gave it, which can be
    another user's: each user sees the name on their own oldest receipt."""
    theirs = await _shop(db_session, USER_B_ID, "LOBLAWS #1234")
    mine = await _shop(db_session, DEV_USER_ID, "Loblaws")
    assert mine.id == theirs.id

    groups = await StoreService(db_session).groups(DEV_USER_ID, [mine.id])

    assert groups[mine.id].name == "Loblaws"
