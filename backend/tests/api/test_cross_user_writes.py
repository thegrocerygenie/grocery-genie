"""DoD box 21: user B can't read or change user A's receipts and budgets.

Each route answers 404, not 403, so B can't even learn that A's item exists,
and A's rows are unchanged afterwards. A's rows are stored directly; B uses
the API (client_user_b).
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Budget, LineItem, Receipt, User
from tests.conftest import DEV_USER_ID, USER_B_ID, ensure_user


@pytest.fixture
async def a_receipt(db_session: AsyncSession) -> Receipt:
    await ensure_user(db_session, DEV_USER_ID)
    receipt = Receipt(
        user_id=DEV_USER_ID,
        date=date(2026, 3, 15),
        status="pending_review",
        currency="USD",
        total=9.5,
    )
    db_session.add(receipt)
    await db_session.flush()
    db_session.add(
        LineItem(
            receipt_id=receipt.id,
            raw_name="Milk",
            quantity=1,
            unit_price=9.5,
            total_price=9.5,
            position=0,
        )
    )
    await db_session.flush()
    return receipt


@pytest.fixture
async def a_deleted_receipt(db_session: AsyncSession, a_receipt: Receipt) -> Receipt:
    a_receipt.deleted_at = datetime.now(UTC)
    await db_session.flush()
    return a_receipt


@pytest.fixture
async def a_budget(db_session: AsyncSession) -> Budget:
    await ensure_user(db_session, DEV_USER_ID)
    budget = Budget(
        user_id=DEV_USER_ID,
        amount=400,
        period_type="monthly",
        period_start=date(2026, 3, 1),
    )
    db_session.add(budget)
    await db_session.flush()
    return budget


async def _receipt_state(db: AsyncSession, receipt_id: uuid.UUID) -> tuple:
    r = (
        await db.execute(
            select(Receipt)
            .where(Receipt.id == receipt_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    price = (
        await db.execute(
            select(LineItem)
            .where(LineItem.receipt_id == r.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return (r.status, r.deleted_at is None, r.date, float(price.total_price))


async def _budget_state(db: AsyncSession, budget_id: uuid.UUID) -> tuple:
    b = (
        await db.execute(
            select(Budget)
            .where(Budget.id == budget_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return (float(b.amount), b.deleted_at is None)


# --- Receipts ---


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/receipts/{id}", None),
        ("GET", "/api/receipts/{id}/image", None),
        ("GET", "/api/receipts/{id}/thumbnail", None),
        ("PATCH", "/api/receipts/{id}", {"status": "confirmed"}),
        ("PATCH", "/api/receipts/{id}", {"date": "2026-03-01"}),
        ("DELETE", "/api/receipts/{id}", None),
    ],
    ids=["get", "image", "thumbnail", "confirm", "edit", "delete"],
)
async def test_b_cannot_touch_as_receipt(
    client_user_b: AsyncClient, db_session, a_receipt, method, path, body
):
    before = await _receipt_state(db_session, a_receipt.id)

    resp = await client_user_b.request(method, path.format(id=a_receipt.id), json=body)

    assert resp.status_code == 404, resp.text
    assert await _receipt_state(db_session, a_receipt.id) == before


async def test_b_cannot_edit_an_item_on_as_receipt(
    client_user_b: AsyncClient, db_session, a_receipt
):
    item_id = (
        await db_session.execute(
            select(LineItem.id).where(LineItem.receipt_id == a_receipt.id)
        )
    ).scalar_one()
    before = await _receipt_state(db_session, a_receipt.id)

    resp = await client_user_b.patch(
        f"/api/receipts/{a_receipt.id}",
        json={"items": [{"id": str(item_id), "total_price": 0.01}]},
    )

    assert resp.status_code == 404, resp.text
    assert await _receipt_state(db_session, a_receipt.id) == before


async def test_b_cannot_restore_as_deleted_receipt(
    client_user_b: AsyncClient, db_session, a_deleted_receipt
):
    resp = await client_user_b.post(f"/api/receipts/{a_deleted_receipt.id}/restore")

    assert resp.status_code == 404, resp.text
    status, live, *_ = await _receipt_state(db_session, a_deleted_receipt.id)
    assert live is False


async def test_b_does_not_see_as_deleted_receipt(
    client_user_b: AsyncClient, a_deleted_receipt
):
    resp = await client_user_b.get("/api/receipts/recently-deleted")

    assert resp.status_code == 200
    assert resp.json() == []


# --- Budgets ---


@pytest.mark.parametrize(
    ("method", "body"),
    [("PATCH", {"amount": 1.0}), ("DELETE", None)],
    ids=["edit", "delete"],
)
async def test_b_cannot_touch_as_budget(
    client_user_b: AsyncClient, db_session, a_budget, method, body
):
    before = await _budget_state(db_session, a_budget.id)

    resp = await client_user_b.request(method, f"/api/budgets/{a_budget.id}", json=body)

    assert resp.status_code == 404, resp.text
    assert await _budget_state(db_session, a_budget.id) == before


async def test_b_cannot_restore_as_deleted_budget(
    client_user_b: AsyncClient, db_session, a_budget
):
    a_budget.deleted_at = datetime.now(UTC)
    await db_session.flush()

    resp = await client_user_b.post(f"/api/budgets/{a_budget.id}/restore")

    assert resp.status_code == 404, resp.text
    assert await _budget_state(db_session, a_budget.id) == (400.0, False)


async def test_b_does_not_see_as_budgets(client_user_b: AsyncClient, a_budget):
    listed = (await client_user_b.get("/api/budgets")).json()
    deleted = (await client_user_b.get("/api/budgets/recently-deleted")).json()

    assert all(b["id"] != str(a_budget.id) for b in listed)
    assert deleted == []


async def test_b_cannot_turn_on_rollover_for_as_budget(
    client_user_b: AsyncClient, db_session, a_budget
):
    """V1.1 D2: a Premium user B still gets 404 on A's budget, not 403."""
    user_b = await db_session.get(User, USER_B_ID)
    user_b.premium_active = True
    user_b.premium_expires_at = datetime.now(UTC) + timedelta(days=30)
    await db_session.flush()

    resp = await client_user_b.put(
        f"/api/budgets/{a_budget.id}/rollover", json={"enabled": True}
    )

    assert resp.status_code == 404, resp.text
    await db_session.refresh(a_budget)
    assert a_budget.rollover_enabled is False
    assert a_budget.rollover_start is None
