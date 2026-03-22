import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories
from app.models.database import Category, LineItem, Receipt


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
