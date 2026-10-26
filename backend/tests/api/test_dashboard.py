import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories
from app.models.database import Category, LineItem, Receipt
from tests.conftest import DEV_USER_ID, USER_B_ID


@pytest.fixture
async def seeded_db(db_session: AsyncSession):
    await seed_default_categories(db_session)
    await db_session.commit()
    return db_session


@pytest.mark.asyncio
async def test_dashboard_empty(client: AsyncClient, seeded_db):
    response = await client.get("/api/dashboard/spending?period=2026-03")
    assert response.status_code == 200
    data = response.json()
    assert data["overall"]["spent"] == 0.0
    assert data["top_items"] == []
    assert len(data["trend"]) == 3


@pytest.mark.asyncio
async def test_dashboard_with_spending(client: AsyncClient, seeded_db, db_session):
    from sqlalchemy import select

    result = await db_session.execute(
        select(Category).where(Category.name == "Groceries")
    )
    cat = result.scalar_one()

    # Create budget
    await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 500.0,
            "period_type": "monthly",
            "period_start": "2026-03-01",
        },
    )

    # Create receipt with items
    user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    receipt = Receipt(
        user_id=user_id,
        date=date(2026, 3, 15),
        status="confirmed",
        currency="USD",
    )
    db_session.add(receipt)
    await db_session.flush()

    for name, price in [("Bananas", 5.0), ("Milk", 4.0), ("Bread", 3.0)]:
        li = LineItem(
            receipt_id=receipt.id,
            raw_name=name,
            quantity=1,
            unit_price=price,
            total_price=price,
            category_id=cat.id,
        )
        db_session.add(li)
    await db_session.commit()

    response = await client.get("/api/dashboard/spending?period=2026-03")
    assert response.status_code == 200
    data = response.json()
    assert data["overall"]["spent"] == 12.0
    assert len(data["top_items"]) == 3
    # Top item by spend should be Bananas ($5)
    assert data["top_items"][0]["name"] == "Bananas"
    assert data["top_items"][0]["total_spent"] == 5.0


@pytest.mark.asyncio
async def test_dashboard_top_items_limit(client: AsyncClient, seeded_db, db_session):
    from sqlalchemy import select

    result = await db_session.execute(
        select(Category).where(Category.name == "Groceries")
    )
    cat = result.scalar_one()

    user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    receipt = Receipt(
        user_id=user_id,
        date=date(2026, 3, 15),
        status="confirmed",
        currency="USD",
    )
    db_session.add(receipt)
    await db_session.flush()

    # Create 15 items
    for i in range(1, 16):
        li = LineItem(
            receipt_id=receipt.id,
            raw_name=f"Item {i}",
            quantity=1,
            unit_price=float(i),
            total_price=float(i),
            category_id=cat.id,
        )
        db_session.add(li)
    await db_session.commit()

    response = await client.get("/api/dashboard/spending?period=2026-03")
    data = response.json()
    assert len(data["top_items"]) == 10


@pytest.mark.asyncio
async def test_dashboard_default_current_month(client: AsyncClient, seeded_db):
    response = await client.get("/api/dashboard/spending")
    assert response.status_code == 200
    data = response.json()
    today = date.today()
    expected_period = f"{today.year:04d}-{today.month:02d}"
    assert data["period"] == expected_period


@pytest.mark.asyncio
async def test_dashboard_trend_3_months(client: AsyncClient, seeded_db):
    response = await client.get("/api/dashboard/spending?period=2026-03")
    data = response.json()
    assert len(data["trend"]) == 3
    assert data["trend"][0]["period"] == "2026-01"
    assert data["trend"][1]["period"] == "2026-02"
    assert data["trend"][2]["period"] == "2026-03"


# --- BC-04 AC 2: month-over-month per category ---


async def _category_id(db_session: AsyncSession, name: str) -> uuid.UUID:
    from sqlalchemy import select

    result = await db_session.execute(select(Category).where(Category.name == name))
    return result.scalar_one().id


async def _add_receipt(
    db_session: AsyncSession,
    on: date,
    items: list[tuple[uuid.UUID | None, float]],
    user_id: uuid.UUID = DEV_USER_ID,
    status: str = "confirmed",
) -> None:
    receipt = Receipt(user_id=user_id, date=on, status=status, currency="USD")
    db_session.add(receipt)
    await db_session.flush()
    for i, (category_id, price) in enumerate(items):
        db_session.add(
            LineItem(
                receipt_id=receipt.id,
                raw_name=f"Item {i}",
                quantity=1,
                unit_price=price,
                total_price=price,
                category_id=category_id,
            )
        )
    await db_session.commit()


@pytest.mark.asyncio
async def test_dashboard_compares_each_category_with_the_previous_month(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    beverages = await _category_id(db_session, "Beverages")
    household = await _category_id(db_session, "Household")

    # February: groceries 20, beverages 10. March: groceries 30, household 5.
    await _add_receipt(
        db_session, date(2026, 2, 10), [(groceries, 20.0), (beverages, 10.0)]
    )
    await _add_receipt(
        db_session, date(2026, 3, 12), [(groceries, 30.0), (household, 5.0)]
    )
    # Uncategorized spend has no category row to compare.
    await _add_receipt(db_session, date(2026, 3, 13), [(None, 7.0)])
    # Neither another user's receipts nor pending scans count.
    await _add_receipt(
        db_session, date(2026, 2, 11), [(beverages, 99.0)], user_id=USER_B_ID
    )
    await _add_receipt(
        db_session, date(2026, 3, 14), [(groceries, 99.0)], status="pending"
    )

    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.status_code == 200
    data = response.json()
    assert data["previous_period"] == "2026-02"
    assert data["category_changes"] == [
        {
            "category_id": str(groceries),
            "name": "Groceries",
            "spent": 30.0,
            "previous_spent": 20.0,
        },
        {
            "category_id": str(household),
            "name": "Household",
            "spent": 5.0,
            "previous_spent": 0.0,
        },
        {
            "category_id": str(beverages),
            "name": "Beverages",
            "spent": 0.0,
            "previous_spent": 10.0,
        },
    ]


@pytest.mark.asyncio
async def test_dashboard_previous_month_crosses_the_year(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    await _add_receipt(db_session, date(2025, 12, 20), [(groceries, 40.0)])

    response = await client.get("/api/dashboard/spending?period=2026-01")

    data = response.json()
    assert data["previous_period"] == "2025-12"
    assert data["category_changes"] == [
        {
            "category_id": str(groceries),
            "name": "Groceries",
            "spent": 0.0,
            "previous_spent": 40.0,
        }
    ]


@pytest.mark.asyncio
async def test_dashboard_without_spending_has_no_category_changes(
    client: AsyncClient, seeded_db
):
    response = await client.get("/api/dashboard/spending?period=2026-03")

    data = response.json()
    assert data["previous_period"] == "2026-02"
    assert data["category_changes"] == []


# --- BC-04 AC 4: the 3-month trend splits each month by category ---


@pytest.mark.asyncio
async def test_dashboard_trend_splits_each_month_by_category(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    beverages = await _category_id(db_session, "Beverages")

    # January: nothing. February: groceries 20 + beverages 10.
    # March: groceries 30 + 7 uncategorized, plus spend that must not count.
    await _add_receipt(
        db_session, date(2026, 2, 10), [(groceries, 20.0), (beverages, 10.0)]
    )
    await _add_receipt(db_session, date(2026, 3, 12), [(groceries, 30.0), (None, 7.0)])
    await _add_receipt(
        db_session, date(2026, 3, 13), [(beverages, 99.0)], user_id=USER_B_ID
    )
    await _add_receipt(
        db_session, date(2026, 3, 14), [(groceries, 99.0)], status="pending"
    )

    response = await client.get("/api/dashboard/spending?period=2026-03")

    trend = response.json()["trend"]
    assert [(m["period"], m["spent"]) for m in trend] == [
        ("2026-01", 0.0),
        ("2026-02", 30.0),
        ("2026-03", 37.0),
    ]
    assert trend[0]["categories"] == []
    # Largest first; uncategorized spend is kept so the segments add up to the total.
    assert trend[1]["categories"] == [
        {"category_id": str(groceries), "name": "Groceries", "spent": 20.0},
        {"category_id": str(beverages), "name": "Beverages", "spent": 10.0},
    ]
    assert trend[2]["categories"] == [
        {"category_id": str(groceries), "name": "Groceries", "spent": 30.0},
        {"category_id": None, "name": "Uncategorized", "spent": 7.0},
    ]


async def _add_named_items(
    db_session: AsyncSession, on: date, items: list[tuple[str, uuid.UUID | None, float]]
) -> None:
    receipt = Receipt(user_id=DEV_USER_ID, date=on, status="confirmed", currency="USD")
    db_session.add(receipt)
    await db_session.flush()
    for name, category_id, price in items:
        db_session.add(
            LineItem(
                receipt_id=receipt.id,
                raw_name=name,
                quantity=1,
                unit_price=price,
                total_price=price,
                category_id=category_id,
            )
        )
    await db_session.commit()


@pytest.mark.asyncio
async def test_dashboard_top_items_carry_their_category(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    beverages = await _category_id(db_session, "Beverages")

    # "Cold brew" was filed under Groceries once and Beverages twice; the
    # category with the most spend wins. "Gift card" has no category.
    await _add_named_items(
        db_session,
        date(2026, 3, 3),
        [("Cold brew", groceries, 4.0), ("Avocado", groceries, 6.0)],
    )
    await _add_named_items(
        db_session,
        date(2026, 3, 9),
        [("Cold brew", beverages, 5.0), ("Cold brew", beverages, 5.0)],
    )
    await _add_named_items(db_session, date(2026, 3, 10), [("Gift card", None, 3.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.json()["top_items"] == [
        {
            "name": "Cold brew",
            "total_spent": 14.0,
            "count": 3,
            "category_id": str(beverages),
            "category_name": "Beverages",
        },
        {
            "name": "Avocado",
            "total_spent": 6.0,
            "count": 1,
            "category_id": str(groceries),
            "category_name": "Groceries",
        },
        {
            "name": "Gift card",
            "total_spent": 3.0,
            "count": 1,
            "category_id": None,
            "category_name": None,
        },
    ]


# --- Design "3-month trend": the 3-month average against the 3 months before ---


@pytest.mark.asyncio
async def test_dashboard_compares_the_trend_with_the_three_months_before(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")

    # Prior window Oct-Dec 2025: 300 + 0 + 150 = 450 -> 150/month.
    # Trend window Jan-Mar 2026 is irrelevant to prior_average.
    await _add_receipt(db_session, date(2025, 10, 5), [(groceries, 300.0)])
    await _add_receipt(db_session, date(2025, 12, 20), [(None, 150.0)])
    await _add_receipt(db_session, date(2026, 1, 9), [(groceries, 99.0)])
    # Before the prior window, another user's, and a pending scan: none count.
    await _add_receipt(db_session, date(2025, 9, 30), [(groceries, 1000.0)])
    await _add_receipt(
        db_session, date(2025, 11, 3), [(groceries, 1000.0)], user_id=USER_B_ID
    )
    await _add_receipt(
        db_session, date(2025, 11, 4), [(groceries, 1000.0)], status="pending"
    )

    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.json()["prior_average"] == 150.0


@pytest.mark.asyncio
async def test_dashboard_prior_average_is_zero_without_earlier_spending(
    client: AsyncClient, seeded_db
):
    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.json()["prior_average"] == 0.0
