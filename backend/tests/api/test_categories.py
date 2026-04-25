"""Tests for GET /api/categories endpoint."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories


@pytest.fixture
async def seeded_db(db_session: AsyncSession):
    await seed_default_categories(db_session)
    await db_session.commit()
    return db_session


EXPECTED_CATEGORIES = {
    "Groceries",
    "Household",
    "Personal Care",
    "Beverages",
    "Snacks & Treats",
    "Baby & Kids",
    "Pet",
    "Other",
}


@pytest.mark.asyncio
async def test_list_categories_returns_eight_defaults(client: AsyncClient, seeded_db):
    """GET /api/categories returns all 8 MVP default categories."""
    assert seeded_db is not None
    response = await client.get("/api/categories")
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) == 8
    names = {c["name"] for c in categories}
    assert names == EXPECTED_CATEGORIES


@pytest.mark.asyncio
async def test_categories_sorted_by_sort_order(client: AsyncClient, seeded_db):
    """Categories are returned in ascending sort_order."""
    assert seeded_db is not None
    response = await client.get("/api/categories")
    categories = response.json()
    sort_orders = [c["sort_order"] for c in categories]
    assert sort_orders == sorted(sort_orders)


@pytest.mark.asyncio
async def test_categories_have_required_fields(client: AsyncClient, seeded_db):
    """Each category has id, name, is_default, sort_order."""
    assert seeded_db is not None
    response = await client.get("/api/categories")
    for cat in response.json():
        assert "id" in cat
        assert "name" in cat
        assert cat["is_default"] is True
        assert "sort_order" in cat


@pytest.mark.asyncio
async def test_categories_empty_without_seed(client: AsyncClient):
    """Without seeding, no categories are returned."""
    response = await client.get("/api/categories")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_categories_requires_auth(db_session):
    """GET /api/categories without a valid token returns 401."""
    from httpx import ASGITransport
    from httpx import AsyncClient as RawClient

    from app.core.dependencies import get_db
    from main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with RawClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            response = await ac.get("/api/categories")
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_groceries_is_first_category(client: AsyncClient, seeded_db):
    """Groceries (sort_order=1) is returned as the first category."""
    assert seeded_db is not None
    response = await client.get("/api/categories")
    first = response.json()[0]
    assert first["name"] == "Groceries"
    assert first["sort_order"] == 1
