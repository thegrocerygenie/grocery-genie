"""Restore and "recently deleted" share RESTORE_WINDOW with the purge task.

Day 29 is restorable and listed; day 31 is neither, and the purge erases it.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.retention import RESTORE_WINDOW, days_remaining
from app.models.database import Budget, Receipt
from app.services.budget_service import BudgetService
from app.services.receipt_service import ReceiptService

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def test_window_is_30_days():
    """The in-app privacy text promises 30 days; change both together."""
    assert timedelta(days=30) == RESTORE_WINDOW


@pytest.mark.parametrize(
    ("age", "left"),
    [
        (timedelta(0), 30),
        (timedelta(days=29, hours=23), 1),
        (timedelta(days=30), 0),
        (timedelta(days=45), 0),
    ],
)
def test_days_remaining(age, left):
    now = datetime(2026, 10, 27, tzinfo=UTC)
    assert days_remaining(now - age, now) == left


def test_days_remaining_accepts_a_naive_timestamp():
    """SQLite drops the zone; the value is still UTC."""
    now = datetime(2026, 10, 27, tzinfo=UTC)
    deleted_at = (now - timedelta(days=10)).replace(tzinfo=None)
    assert days_remaining(deleted_at, now) == 20


async def _receipt(db: AsyncSession, days_ago: int) -> Receipt:
    receipt = Receipt(
        user_id=USER_ID,
        date=date(2026, 9, 1),
        deleted_at=datetime.now(UTC) - timedelta(days=days_ago),
    )
    db.add(receipt)
    await db.flush()
    return receipt


async def _budget(db: AsyncSession, days_ago: int) -> Budget:
    budget = Budget(
        user_id=USER_ID,
        amount=400,
        period_start=date(2026, 9, 1),
        deleted_at=datetime.now(UTC) - timedelta(days=days_ago),
    )
    db.add(budget)
    await db.flush()
    return budget


async def test_receipt_deleted_29_days_ago_is_listed_and_restorable(db_session):
    service = ReceiptService(db=db_session)
    receipt = await _receipt(db_session, 29)

    listed = await service.list_recently_deleted(USER_ID)
    restored = await service.restore_receipt(receipt.id, USER_ID)

    assert [r.id for r in listed] == [receipt.id]
    assert restored.deleted_at is None


async def test_receipt_deleted_31_days_ago_is_gone(db_session):
    service = ReceiptService(db=db_session)
    receipt = await _receipt(db_session, 31)

    assert await service.list_recently_deleted(USER_ID) == []
    with pytest.raises(ValueError, match="restore window"):
        await service.restore_receipt(receipt.id, USER_ID)


async def test_budget_deleted_29_days_ago_is_listed_and_restorable(db_session):
    service = BudgetService(db_session)
    budget = await _budget(db_session, 29)

    listed = await service.list_recently_deleted(USER_ID)
    restored = await service.restore_budget(budget.id, USER_ID)

    assert [b.id for b in listed] == [budget.id]
    assert restored.deleted_at is None


async def test_budget_deleted_31_days_ago_is_gone(db_session):
    service = BudgetService(db_session)
    budget = await _budget(db_session, 31)

    assert await service.list_recently_deleted(USER_ID) == []
    with pytest.raises(ValueError, match="restore window"):
        await service.restore_budget(budget.id, USER_ID)
