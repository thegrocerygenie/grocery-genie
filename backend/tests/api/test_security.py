"""Security tests: authentication, user isolation, and rate limiting."""

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.database import Budget, Category, Receipt, User
from tests.conftest import DEV_USER_ID, DEV_USER_TOKEN, USER_B_ID, USER_B_TOKEN


@pytest.fixture
async def seeded_users(db_session):
    """Seed two users with tokens into the test DB."""
    user_a = User(
        id=DEV_USER_ID,
        email="usera@test.com",
        name="User A",
        api_token=DEV_USER_TOKEN,
    )
    user_b = User(
        id=USER_B_ID,
        email="userb@test.com",
        name="User B",
        api_token=USER_B_TOKEN,
    )
    db_session.add_all([user_a, user_b])
    await db_session.flush()
    return user_a, user_b


@pytest.fixture
async def raw_client(db_session, mock_extractor, db_engine):
    """Client with NO auth override — tests real security.py auth flow."""
    from app.core.dependencies import get_db
    from app.llm.provider import get_receipt_extractor
    from main import app

    async def override_get_db():
        yield db_session

    def override_get_extractor():
        return mock_extractor

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_receipt_extractor] = override_get_extractor
    # NOTE: get_current_user is NOT overridden — real auth runs

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# --- Authentication ---


@pytest.mark.asyncio
async def test_unauthenticated_returns_401(raw_client):
    """Request without Authorization header returns 401."""
    response = await raw_client.get("/api/receipts")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_returns_401(raw_client, seeded_users):
    """Invalid bearer token returns 401."""
    response = await raw_client.get(
        "/api/receipts",
        headers={"Authorization": "Bearer bad-token-12345"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_authenticates(raw_client, seeded_users):
    """Valid token allows access."""
    response = await raw_client.get(
        "/api/receipts",
        headers={"Authorization": f"Bearer {DEV_USER_TOKEN}"},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_no_auth(raw_client):
    """Health endpoint works without authentication."""
    response = await raw_client.get("/health")
    assert response.status_code == 200


# --- User Isolation ---


@pytest.fixture
async def user_a_receipt(db_session):
    """Create a receipt owned by User A."""
    category = Category(
        id=uuid.uuid4(), name="Groceries", is_default=True, sort_order=0
    )
    db_session.add(category)
    await db_session.flush()

    receipt = Receipt(
        id=uuid.uuid4(),
        user_id=DEV_USER_ID,
        date=date(2026, 3, 15),
        status="confirmed",
        currency="USD",
    )
    db_session.add(receipt)
    await db_session.flush()

    budget = Budget(
        id=uuid.uuid4(),
        user_id=DEV_USER_ID,
        amount=500.0,
        period_start=date(2026, 3, 1),
        period_type="monthly",
    )
    db_session.add(budget)
    await db_session.flush()
    return receipt, budget


@pytest.mark.asyncio
async def test_user_isolation_receipts(raw_client, seeded_users, user_a_receipt):
    """User B cannot see User A's receipts."""
    receipt, _ = user_a_receipt

    # User A sees the receipt
    resp_a = await raw_client.get(
        "/api/receipts",
        headers={"Authorization": f"Bearer {DEV_USER_TOKEN}"},
    )
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["total"] >= 1

    # User B sees no receipts
    resp_b = await raw_client.get(
        "/api/receipts",
        headers={"Authorization": f"Bearer {USER_B_TOKEN}"},
    )
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["total"] == 0

    # User B cannot access User A's receipt directly
    resp_detail = await raw_client.get(
        f"/api/receipts/{receipt.id}",
        headers={"Authorization": f"Bearer {USER_B_TOKEN}"},
    )
    assert resp_detail.status_code in (404, 400)


@pytest.mark.asyncio
async def test_user_isolation_budgets(raw_client, seeded_users, user_a_receipt):
    """User B cannot see User A's budget summary."""
    # User A has a budget
    resp_a = await raw_client.get(
        "/api/budgets/summary?period=2026-03",
        headers={"Authorization": f"Bearer {DEV_USER_TOKEN}"},
    )
    assert resp_a.status_code == 200
    assert resp_a.json()["overall"]["budget"] == 500.0

    # User B gets zeroed budget (no budgets set)
    resp_b = await raw_client.get(
        "/api/budgets/summary?period=2026-03",
        headers={"Authorization": f"Bearer {USER_B_TOKEN}"},
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["overall"]["budget"] == 0.0
