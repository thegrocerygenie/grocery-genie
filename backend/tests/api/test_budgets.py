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


# --- BC-02 AC 4: editing a budget never creates a duplicate ---


async def _category_id(db_session: AsyncSession, name: str) -> str:
    from sqlalchemy import select

    result = await db_session.execute(select(Category).where(Category.name == name))
    return str(result.scalar_one().id)


def _budget(category_id: str | None, amount: float, start: str = "2026-03-01") -> dict:
    return {
        "category_id": category_id,
        "amount": amount,
        "period_type": "monthly",
        "period_start": start,
    }


@pytest.mark.asyncio
async def test_post_for_a_category_with_a_budget_updates_it(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    first = await client.post("/api/budgets", json=_budget(groceries, 200.0))

    second = await client.post("/api/budgets", json=_budget(groceries, 250.0))

    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["amount"] == 250.0
    listed = (await client.get("/api/budgets")).json()
    assert [(b["category_id"], b["amount"]) for b in listed] == [(groceries, 250.0)]


@pytest.mark.asyncio
async def test_post_overall_twice_keeps_one_overall_budget(
    client: AsyncClient, seeded_db
):
    first = await client.post("/api/budgets", json=_budget(None, 500.0))

    second = await client.post("/api/budgets", json=_budget(None, 650.0, "2026-03-15"))

    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["period_start"] == "2026-03-15"
    listed = (await client.get("/api/budgets")).json()
    assert [(b["category_id"], b["amount"]) for b in listed] == [(None, 650.0)]


@pytest.mark.asyncio
async def test_summary_lists_each_category_once_after_repeat_saves(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    await client.post("/api/budgets", json=_budget(groceries, 200.0))
    await client.post("/api/budgets", json=_budget(groceries, 300.0))

    summary = (await client.get("/api/budgets/summary?period=2026-03")).json()

    rows = [c for c in summary["categories"] if c["category_id"] == groceries]
    assert [r["budget"] for r in rows] == [300.0]


@pytest.mark.asyncio
async def test_list_budgets_returns_only_the_users_active_budgets(
    client: AsyncClient, seeded_db, db_session
):
    from app.models.database import Budget
    from tests.conftest import USER_B_ID

    groceries = await _category_id(db_session, "Groceries")
    household = await _category_id(db_session, "Household")
    overall = (await client.post("/api/budgets", json=_budget(None, 500.0))).json()
    kept = (await client.post("/api/budgets", json=_budget(groceries, 200.0))).json()
    dropped = (await client.post("/api/budgets", json=_budget(household, 50.0))).json()
    await client.delete(f"/api/budgets/{dropped['id']}")
    db_session.add(
        Budget(
            user_id=USER_B_ID,
            category_id=uuid.UUID(groceries),
            amount=999.0,
            period_start=date(2026, 3, 1),
            period_type="monthly",
        )
    )
    await db_session.commit()

    response = await client.get("/api/budgets")

    assert response.status_code == 200
    assert sorted(b["id"] for b in response.json()) == sorted(
        [overall["id"], kept["id"]]
    )


@pytest.mark.asyncio
async def test_patch_can_change_the_start_day(client: AsyncClient, seeded_db):
    created = (await client.post("/api/budgets", json=_budget(None, 500.0))).json()

    response = await client.patch(
        f"/api/budgets/{created['id']}",
        json={"amount": 500.0, "period_start": "2026-03-15"},
    )

    assert response.status_code == 200
    assert response.json()["period_start"] == "2026-03-15"


@pytest.mark.asyncio
async def test_post_after_delete_creates_a_new_budget(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    old = (await client.post("/api/budgets", json=_budget(groceries, 200.0))).json()
    await client.delete(f"/api/budgets/{old['id']}")

    response = await client.post("/api/budgets", json=_budget(groceries, 120.0))

    # Same (user, category, start) as the deleted row, so it comes back as the
    # new budget rather than tripping the unique constraint.
    assert response.status_code == 201
    listed = (await client.get("/api/budgets")).json()
    assert [(b["category_id"], b["amount"]) for b in listed] == [(groceries, 120.0)]
    deleted = (await client.get("/api/budgets/recently-deleted")).json()
    assert old["id"] not in [d["id"] for d in deleted]


@pytest.mark.asyncio
async def test_restore_refuses_when_the_category_has_a_new_budget(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    old = (await client.post("/api/budgets", json=_budget(groceries, 200.0))).json()
    await client.delete(f"/api/budgets/{old['id']}")
    await client.post("/api/budgets", json=_budget(groceries, 120.0, "2026-04-01"))

    response = await client.post(f"/api/budgets/{old['id']}/restore")

    assert response.status_code == 409
    listed = (await client.get("/api/budgets")).json()
    assert [b["amount"] for b in listed] == [120.0]


@pytest.mark.asyncio
async def test_restore_brings_back_a_deleted_budget(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    old = (await client.post("/api/budgets", json=_budget(groceries, 200.0))).json()
    await client.delete(f"/api/budgets/{old['id']}")

    response = await client.post(f"/api/budgets/{old['id']}/restore")

    assert response.status_code == 200
    listed = (await client.get("/api/budgets")).json()
    assert [(b["id"], b["amount"]) for b in listed] == [(old["id"], 200.0)]
