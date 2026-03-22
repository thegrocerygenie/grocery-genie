import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Category, LineItem, Receipt
from app.models.schemas import BudgetCreateRequest
from app.services.budget_service import BudgetService


@pytest.fixture
async def default_categories(db_session: AsyncSession) -> list[Category]:
    """Seed default categories and return them."""
    cats = []
    for name, order in [
        ("Groceries", 1),
        ("Household", 2),
        ("Beverages", 3),
        ("Other", 4),
    ]:
        cat = Category(name=name, is_default=True, user_id=None, sort_order=order)
        db_session.add(cat)
        cats.append(cat)
    await db_session.flush()
    return cats


@pytest.fixture
def user_id() -> uuid.UUID:
    return uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def service(db_session: AsyncSession) -> BudgetService:
    return BudgetService(db_session)


async def _create_confirmed_receipt(
    db: AsyncSession,
    user_id: uuid.UUID,
    receipt_date: date,
    items: list[tuple[str, float, uuid.UUID | None]],
) -> Receipt:
    """Helper: create a confirmed receipt with line items."""
    receipt = Receipt(
        user_id=user_id,
        date=receipt_date,
        status="confirmed",
        currency="USD",
    )
    db.add(receipt)
    await db.flush()

    for name, price, cat_id in items:
        li = LineItem(
            receipt_id=receipt.id,
            raw_name=name,
            quantity=1,
            unit_price=price,
            total_price=price,
            category_id=cat_id,
        )
        db.add(li)
    await db.flush()
    return receipt


@pytest.mark.asyncio
async def test_create_budget_overall(service, user_id, db_session):
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-01"
    )
    budget = await service.create_budget(user_id, request)
    assert budget.amount == 500.0
    assert budget.category_id is None
    assert budget.user_id == user_id


@pytest.mark.asyncio
async def test_create_budget_per_category(
    service, user_id, default_categories, db_session
):
    cat = default_categories[0]
    request = BudgetCreateRequest(
        category_id=cat.id,
        amount=200.0,
        period_type="monthly",
        period_start="2026-03-01",
    )
    budget = await service.create_budget(user_id, request)
    assert budget.category_id == cat.id
    assert budget.amount == 200.0


@pytest.mark.asyncio
async def test_create_budget_invalid_category(service, user_id, db_session):
    request = BudgetCreateRequest(
        category_id=uuid.uuid4(),
        amount=100.0,
        period_type="monthly",
        period_start="2026-03-01",
    )
    with pytest.raises(ValueError, match="not found"):
        await service.create_budget(user_id, request)


@pytest.mark.asyncio
async def test_update_budget(service, user_id, db_session):
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-01"
    )
    budget = await service.create_budget(user_id, request)
    updated = await service.update_budget(budget.id, user_id, 750.0)
    assert updated.amount == 750.0


@pytest.mark.asyncio
async def test_update_budget_not_found(service, user_id, db_session):
    with pytest.raises(ValueError, match="not found"):
        await service.update_budget(uuid.uuid4(), user_id, 100.0)


@pytest.mark.asyncio
async def test_get_period_dates_default(service, user_id, db_session):
    start, end = await service.get_period_dates(user_id, "2026-03")
    assert start == date(2026, 3, 1)
    assert end == date(2026, 3, 31)


@pytest.mark.asyncio
async def test_get_period_dates_custom_start(service, user_id, db_session):
    # Create budget with start day = 15
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-15"
    )
    await service.create_budget(user_id, request)

    start, end = await service.get_period_dates(user_id, "2026-03")
    assert start == date(2026, 3, 15)
    assert end == date(2026, 4, 14)


@pytest.mark.asyncio
async def test_spending_empty(service, user_id, db_session):
    summary = await service.get_budget_summary(user_id, "2026-03")
    assert summary.overall.spent == 0.0
    assert summary.overall.budget == 0.0
    assert len(summary.categories) == 0


@pytest.mark.asyncio
async def test_spending_with_receipts(service, user_id, default_categories, db_session):
    cat = default_categories[0]  # Groceries
    await _create_confirmed_receipt(
        db_session,
        user_id,
        date(2026, 3, 10),
        [("Bananas", 1.50, cat.id), ("Milk", 4.99, cat.id)],
    )

    # Create budget
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-01"
    )
    await service.create_budget(user_id, request)

    summary = await service.get_budget_summary(user_id, "2026-03")
    assert summary.overall.spent == 6.49
    assert summary.overall.budget == 500.0
    assert summary.overall.remaining == 493.51


@pytest.mark.asyncio
async def test_spending_excludes_pending(
    service, user_id, default_categories, db_session
):
    cat = default_categories[0]
    # Pending receipt should not count
    receipt = Receipt(
        user_id=user_id,
        date=date(2026, 3, 10),
        status="pending_review",
        currency="USD",
    )
    db_session.add(receipt)
    await db_session.flush()
    li = LineItem(
        receipt_id=receipt.id,
        raw_name="Item",
        quantity=1,
        unit_price=10.0,
        total_price=10.0,
        category_id=cat.id,
    )
    db_session.add(li)
    await db_session.flush()

    spending = await service.get_spending_by_category(
        user_id, date(2026, 3, 1), date(2026, 3, 31)
    )
    assert len(spending) == 0


@pytest.mark.asyncio
async def test_check_thresholds_below_80(
    service, user_id, default_categories, db_session
):
    cat = default_categories[0]
    await _create_confirmed_receipt(
        db_session,
        user_id,
        date(2026, 3, 10),
        [("Bananas", 10.0, cat.id)],
    )
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-01"
    )
    await service.create_budget(user_id, request)

    breaches = await service.check_thresholds(user_id, date(2026, 3, 10))
    assert len(breaches) == 0


@pytest.mark.asyncio
async def test_check_thresholds_at_80(service, user_id, default_categories, db_session):
    cat = default_categories[0]
    await _create_confirmed_receipt(
        db_session,
        user_id,
        date(2026, 3, 10),
        [("Big order", 80.0, cat.id)],
    )
    request = BudgetCreateRequest(
        category_id=None, amount=100.0, period_type="monthly", period_start="2026-03-01"
    )
    await service.create_budget(user_id, request)

    breaches = await service.check_thresholds(user_id, date(2026, 3, 10))
    assert any(b.threshold_percent == 80 for b in breaches)


@pytest.mark.asyncio
async def test_check_thresholds_at_100(
    service, user_id, default_categories, db_session
):
    cat = default_categories[0]
    await _create_confirmed_receipt(
        db_session,
        user_id,
        date(2026, 3, 10),
        [("Big order", 110.0, cat.id)],
    )
    request = BudgetCreateRequest(
        category_id=None, amount=100.0, period_type="monthly", period_start="2026-03-01"
    )
    await service.create_budget(user_id, request)

    breaches = await service.check_thresholds(user_id, date(2026, 3, 10))
    assert any(b.threshold_percent == 100 for b in breaches)
    assert any(b.threshold_percent == 80 for b in breaches)


@pytest.mark.asyncio
async def test_dashboard_data(service, user_id, default_categories, db_session):
    cat = default_categories[0]
    await _create_confirmed_receipt(
        db_session,
        user_id,
        date(2026, 3, 10),
        [("Bananas", 5.0, cat.id), ("Milk", 4.0, cat.id)],
    )
    request = BudgetCreateRequest(
        category_id=None, amount=500.0, period_type="monthly", period_start="2026-03-01"
    )
    await service.create_budget(user_id, request)

    data = await service.get_dashboard_data(user_id, "2026-03")
    assert data.overall.spent == 9.0
    assert len(data.top_items) == 2
    assert data.top_items[0].name == "Bananas"
    assert len(data.trend) == 3


@pytest.mark.asyncio
async def test_top_items_limited_to_10(
    service, user_id, default_categories, db_session
):
    cat = default_categories[0]
    items = [(f"Item {i}", float(i), cat.id) for i in range(1, 15)]
    await _create_confirmed_receipt(db_session, user_id, date(2026, 3, 10), items)

    start, end = await service.get_period_dates(user_id, "2026-03")
    top = await service.get_top_items(user_id, start, end)
    assert len(top) == 10
    assert top[0].total_spent >= top[-1].total_spent
