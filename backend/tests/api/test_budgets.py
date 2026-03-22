import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories
from app.models.database import Category, LineItem, Receipt


@pytest.fixture
async def seeded_db(db_session: AsyncSession):
    """Seed default categories before tests."""
    await seed_default_categories(db_session)
    await db_session.commit()
    return db_session


@pytest.mark.asyncio
async def test_create_budget_success(client: AsyncClient, seeded_db):
    response = await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 500.0,
            "period_type": "monthly",
            "period_start": "2026-03-01",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == 500.0
    assert data["category_id"] is None


@pytest.mark.asyncio
async def test_create_budget_with_category(client: AsyncClient, seeded_db, db_session):
    # Get a real category ID
    from sqlalchemy import select

    result = await db_session.execute(
        select(Category).where(Category.name == "Groceries")
    )
    cat = result.scalar_one()

    response = await client.post(
        "/api/budgets",
        json={
            "category_id": str(cat.id),
            "amount": 200.0,
            "period_type": "monthly",
            "period_start": "2026-03-01",
        },
    )
    assert response.status_code == 201
    assert response.json()["category_id"] == str(cat.id)


@pytest.mark.asyncio
async def test_create_budget_invalid_category(client: AsyncClient, seeded_db):
    response = await client.post(
        "/api/budgets",
        json={
            "category_id": str(uuid.uuid4()),
            "amount": 100.0,
            "period_type": "monthly",
            "period_start": "2026-03-01",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_budget_summary_empty(client: AsyncClient, seeded_db):
    response = await client.get("/api/budgets/summary?period=2026-03")
    assert response.status_code == 200
    data = response.json()
    assert data["overall"]["spent"] == 0.0
    assert data["overall"]["budget"] == 0.0


@pytest.mark.asyncio
async def test_budget_summary_with_spending(client: AsyncClient, seeded_db, db_session):
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

    # Create confirmed receipt with items
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

    li = LineItem(
        receipt_id=receipt.id,
        raw_name="Bananas",
        quantity=1,
        unit_price=5.0,
        total_price=5.0,
        category_id=cat.id,
    )
    db_session.add(li)
    await db_session.commit()

    response = await client.get("/api/budgets/summary?period=2026-03")
    assert response.status_code == 200
    data = response.json()
    assert data["overall"]["spent"] == 5.0
    assert data["overall"]["budget"] == 500.0


@pytest.mark.asyncio
async def test_update_budget(client: AsyncClient, seeded_db):
    # Create budget first
    create_resp = await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 500.0,
            "period_type": "monthly",
            "period_start": "2026-03-01",
        },
    )
    budget_id = create_resp.json()["id"]

    # Update
    response = await client.patch(f"/api/budgets/{budget_id}", json={"amount": 750.0})
    assert response.status_code == 200
    assert response.json()["amount"] == 750.0


@pytest.mark.asyncio
async def test_update_budget_not_found(client: AsyncClient, seeded_db):
    budget_id = uuid.uuid4()
    response = await client.patch(f"/api/budgets/{budget_id}", json={"amount": 100.0})
    assert response.status_code == 404
