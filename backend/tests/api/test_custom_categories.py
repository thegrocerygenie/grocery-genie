"""Custom categories (BC-05 AC 3, V11-P1): up to 10 per user, Premium only.

Create and rename need Premium (D2); a free user gets ``403 premium_required``.
A category stays the user's after Premium lapses: it still lists, still takes
corrections and budgets, and can be deleted, but not renamed or added to.
Deleting one moves its line items to "Other", clears it from item mappings,
and removes its budgets.
"""

import io
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories
from app.models.database import (
    Budget,
    Category,
    LineItem,
    User,
    UserItemMapping,
)
from tests.conftest import DEV_USER_ID

PERIOD = "2026-03"


@pytest.fixture
async def seeded(db_session: AsyncSession):
    await seed_default_categories(db_session)
    await db_session.flush()


@pytest.fixture
async def premium(client: AsyncClient, db_session: AsyncSession) -> User:
    """Make the signed-in user (``client``) Premium, with no expiry."""
    user = await db_session.get(User, DEV_USER_ID)
    assert user is not None
    user.premium_active = True
    user.premium_expires_at = None
    await db_session.flush()
    return user


async def _create(client: AsyncClient, name: str):
    return await client.post("/api/categories", json={"name": name})


async def _category_id(client: AsyncClient, name: str) -> str:
    resp = await client.get("/api/categories")
    return next(c["id"] for c in resp.json() if c["name"] == name)


async def _scan(client: AsyncClient, image_bytes: bytes) -> dict:
    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
    )
    assert resp.status_code == 200
    return resp.json()


# --- Gating (D2) ---


async def test_free_user_cannot_create_a_category(client: AsyncClient, seeded):
    resp = await _create(client, "Garden")
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["code"] == "premium_required"
    assert detail["feature"] == "custom_categories"


async def test_premium_user_creates_a_category(client: AsyncClient, seeded, premium):
    resp = await _create(client, "  Garden  ")
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Garden"
    assert body["is_default"] is False
    uuid.UUID(body["id"])

    listed = (await client.get("/api/categories")).json()
    assert [c["name"] for c in listed][-1] == "Garden"
    assert len(listed) == 9


async def test_custom_categories_sort_after_defaults_in_creation_order(
    client: AsyncClient, seeded, premium
):
    for name in ("Zoo", "Alpha"):
        assert (await _create(client, name)).status_code == 201
    names = [c["name"] for c in (await client.get("/api/categories")).json()]
    assert names[-2:] == ["Zoo", "Alpha"]
    assert names[0] == "Groceries"


# --- The cap: 10 additional (BC-05 AC 3) ---


async def test_premium_user_can_create_ten_and_the_eleventh_is_refused(
    client: AsyncClient, seeded, premium
):
    for n in range(10):
        assert (await _create(client, f"Custom {n}")).status_code == 201
    resp = await _create(client, "One too many")
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "category_limit_reached"
    assert detail["limit"] == 10
    assert len((await client.get("/api/categories")).json()) == 18


async def test_deleting_one_frees_a_slot(client: AsyncClient, seeded, premium):
    ids = [(await _create(client, f"Custom {n}")).json()["id"] for n in range(10)]
    assert (await client.delete(f"/api/categories/{ids[0]}")).status_code == 204
    assert (await _create(client, "Back under the cap")).status_code == 201


async def test_the_cap_is_per_user(
    client: AsyncClient, seeded, premium, db_session: AsyncSession
):
    """Another user's categories don't count toward this user's ten."""
    other = User(email="other@test.com", name="Other")
    db_session.add(other)
    await db_session.flush()
    for n in range(10):
        db_session.add(Category(name=f"Theirs {n}", user_id=other.id, sort_order=100))
    await db_session.flush()
    assert (await _create(client, "Mine")).status_code == 201


# --- Names ---


@pytest.mark.parametrize("name", ["", "   ", "x" * 41])
async def test_name_must_be_1_to_40_characters(
    client: AsyncClient, seeded, premium, name: str
):
    assert (await _create(client, name)).status_code == 422


@pytest.mark.parametrize("name", ["groceries", "OTHER", "Garden", "garden "])
async def test_name_must_not_repeat_a_default_or_own_category(
    client: AsyncClient, seeded, premium, name: str
):
    assert (await _create(client, "Garden")).status_code == 201
    resp = await _create(client, name)
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "category_name_taken"


async def test_two_users_may_use_the_same_name(
    client: AsyncClient, seeded, premium, db_session: AsyncSession
):
    other = User(email="other@test.com", name="Other")
    db_session.add(other)
    await db_session.flush()
    db_session.add(Category(name="Garden", user_id=other.id, sort_order=101))
    await db_session.flush()
    assert (await _create(client, "Garden")).status_code == 201


# --- Rename ---


async def test_premium_user_renames_a_category(client: AsyncClient, seeded, premium):
    cid = (await _create(client, "Garden")).json()["id"]
    resp = await client.patch(f"/api/categories/{cid}", json={"name": "Yard"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Yard"
    names = [c["name"] for c in (await client.get("/api/categories")).json()]
    assert "Yard" in names and "Garden" not in names


async def test_rename_to_its_own_name_in_another_case_is_allowed(
    client: AsyncClient, seeded, premium
):
    cid = (await _create(client, "garden")).json()["id"]
    resp = await client.patch(f"/api/categories/{cid}", json={"name": "Garden"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Garden"


async def test_rename_to_a_taken_name_is_refused(client: AsyncClient, seeded, premium):
    cid = (await _create(client, "Garden")).json()["id"]
    resp = await client.patch(f"/api/categories/{cid}", json={"name": "Pet"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "category_name_taken"


async def test_default_categories_cannot_be_renamed_or_deleted(
    client: AsyncClient, seeded, premium
):
    groceries = await _category_id(client, "Groceries")
    resp = await client.patch(f"/api/categories/{groceries}", json={"name": "Food"})
    assert resp.status_code == 404
    assert (await client.delete(f"/api/categories/{groceries}")).status_code == 404


async def test_another_users_category_cannot_be_renamed_or_deleted(
    client: AsyncClient, seeded, premium, db_session: AsyncSession
):
    other = User(email="other@test.com", name="Other")
    db_session.add(other)
    await db_session.flush()
    theirs = Category(name="Theirs", user_id=other.id, sort_order=101)
    db_session.add(theirs)
    await db_session.flush()
    resp = await client.patch(f"/api/categories/{theirs.id}", json={"name": "Mine"})
    assert resp.status_code == 404
    assert (await client.delete(f"/api/categories/{theirs.id}")).status_code == 404
    # And it never lists for this user.
    names = [c["name"] for c in (await client.get("/api/categories")).json()]
    assert "Theirs" not in names


# --- Premium lapses: keep the data, block create and rename ---


async def test_after_premium_lapses_categories_stay_and_can_be_deleted_not_changed(
    client: AsyncClient, seeded, premium: User, db_session: AsyncSession
):
    cid = (await _create(client, "Garden")).json()["id"]
    premium.premium_active = False
    await db_session.flush()

    names = [c["name"] for c in (await client.get("/api/categories")).json()]
    assert "Garden" in names

    rename = await client.patch(f"/api/categories/{cid}", json={"name": "Yard"})
    assert rename.status_code == 403
    assert rename.json()["detail"]["code"] == "premium_required"
    assert (await _create(client, "Another")).status_code == 403

    budget = await client.post(
        "/api/budgets",
        json={"category_id": cid, "amount": 40, "period_start": "2026-03-01"},
    )
    assert budget.status_code == 201

    assert (await client.delete(f"/api/categories/{cid}")).status_code == 204


# --- Used across the app: corrections, assignment, budgets, dashboard ---


async def test_custom_category_in_a_correction_teaches_the_next_scan(
    client: AsyncClient, seeded, premium, test_image_bytes: bytes
):
    """BC-05 AC 2 and 4 with a custom category: the correction applies to the
    item's history and the next scan assigns it deterministically."""
    garden = (await _create(client, "Fruit Bowl")).json()["id"]
    first = await _scan(client, test_image_bytes)
    bananas = next(
        i for i in first["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    resp = await client.patch(
        f"/api/receipts/{first['receipt_id']}",
        json={
            "items": [{"id": bananas["id"], "category_id": garden}],
            "status": "confirmed",
        },
    )
    assert resp.status_code == 200
    corrected = next(i for i in resp.json()["items"] if i["id"] == bananas["id"])
    assert corrected["category_id"] == garden

    rescan = await _scan(client, test_image_bytes)
    again = next(
        i for i in rescan["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    assert again["category_id"] == garden
    assert again["category_confidence"] == 1.0


async def test_custom_category_budget_and_dashboard_spending(
    client: AsyncClient, seeded, premium, test_image_bytes: bytes
):
    cid = (await _create(client, "Fruit Bowl")).json()["id"]
    budget = await client.post(
        "/api/budgets",
        json={"category_id": cid, "amount": 10, "period_start": "2026-03-01"},
    )
    assert budget.status_code == 201

    scan = await _scan(client, test_image_bytes)
    bananas = next(
        i for i in scan["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={
            "items": [{"id": bananas["id"], "category_id": cid}],
            "status": "confirmed",
        },
    )
    assert resp.status_code == 200

    summary = (await client.get(f"/api/budgets/summary?period={PERIOD}")).json()
    row = next(c for c in summary["categories"] if c["category_id"] == cid)
    assert row["name"] == "Fruit Bowl"
    assert row["budget"] == 10
    assert row["spent"] == pytest.approx(bananas["total_price"])

    dash = (await client.get(f"/api/dashboard/spending?period={PERIOD}")).json()
    changes = {c["category_id"]: c for c in dash["category_changes"]}
    assert changes[cid]["name"] == "Fruit Bowl"
    month = dash["trend"][-1]
    assert any(c["category_id"] == cid for c in month["categories"])


async def test_manual_receipt_takes_a_custom_category(
    client: AsyncClient, seeded, premium
):
    cid = (await _create(client, "Fruit Bowl")).json()["id"]
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Market",
            "date": "2026-03-10",
            "total": 3.0,
            "items": [
                {
                    "name": "Kiwi",
                    "unit_price": 3.0,
                    "total_price": 3.0,
                    "category_id": cid,
                }
            ],
        },
    )
    assert resp.status_code == 201
    assert resp.json()["items"][0]["category_id"] == cid


# --- Another user's category is never usable ---


@pytest.fixture
async def foreign_category(db_session: AsyncSession) -> str:
    other = User(email="other@test.com", name="Other")
    db_session.add(other)
    await db_session.flush()
    theirs = Category(name="Theirs", user_id=other.id, sort_order=101)
    db_session.add(theirs)
    await db_session.flush()
    return str(theirs.id)


async def test_budget_refuses_another_users_category(
    client: AsyncClient, seeded, foreign_category: str
):
    resp = await client.post(
        "/api/budgets",
        json={
            "category_id": foreign_category,
            "amount": 10,
            "period_start": "2026-03-01",
        },
    )
    assert resp.status_code == 400


async def test_correction_refuses_another_users_category(
    client: AsyncClient, seeded, foreign_category: str, test_image_bytes: bytes
):
    scan = await _scan(client, test_image_bytes)
    item = scan["extraction"]["items"][0]
    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": item["id"], "category_id": foreign_category}]},
    )
    assert resp.status_code == 400
    after = (await client.get(f"/api/receipts/{scan['receipt_id']}")).json()
    kept = next(i for i in after["items"] if i["id"] == item["id"])
    assert kept["category_id"] == item["category_id"]


async def test_manual_receipt_refuses_another_users_category(
    client: AsyncClient, seeded, foreign_category: str
):
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Market",
            "date": "2026-03-10",
            "total": 3.0,
            "items": [
                {
                    "name": "Kiwi",
                    "unit_price": 3.0,
                    "total_price": 3.0,
                    "category_id": foreign_category,
                }
            ],
        },
    )
    assert resp.status_code == 400


async def test_unknown_category_id_is_refused(client: AsyncClient, seeded):
    resp = await client.post(
        "/api/budgets",
        json={
            "category_id": str(uuid.uuid4()),
            "amount": 10,
            "period_start": "2026-03-01",
        },
    )
    assert resp.status_code == 400


# --- Delete: items fall back to Other, mappings clear, budgets go ---


async def test_delete_moves_items_to_other_and_removes_its_budget(
    client: AsyncClient,
    seeded,
    premium,
    test_image_bytes: bytes,
    db_session: AsyncSession,
):
    cid = (await _create(client, "Fruit Bowl")).json()["id"]
    other_id = await _category_id(client, "Other")
    await client.post(
        "/api/budgets",
        json={"category_id": cid, "amount": 10, "period_start": "2026-03-01"},
    )
    overall = await client.post(
        "/api/budgets", json={"amount": 500, "period_start": "2026-03-01"}
    )
    assert overall.status_code == 201
    muted = await client.patch("/api/users/me", json={"muted_alert_categories": [cid]})
    assert muted.status_code == 200

    scan = await _scan(client, test_image_bytes)
    bananas = next(
        i for i in scan["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={
            "items": [{"id": bananas["id"], "category_id": cid}],
            "status": "confirmed",
        },
    )
    before = (await client.get(f"/api/budgets/summary?period={PERIOD}")).json()

    assert (await client.delete(f"/api/categories/{cid}")).status_code == 204

    names = [c["name"] for c in (await client.get("/api/categories")).json()]
    assert "Fruit Bowl" not in names
    receipt = (await client.get(f"/api/receipts/{scan['receipt_id']}")).json()
    moved = next(i for i in receipt["items"] if i["id"] == bananas["id"])
    assert moved["category_id"] == other_id

    budgets = (await client.get("/api/budgets")).json()
    assert [b["category_id"] for b in budgets] == [None]
    # Spend is kept: the overall budget still counts it.
    after = (await client.get(f"/api/budgets/summary?period={PERIOD}")).json()
    assert after["overall"]["spent"] == before["overall"]["spent"]

    db_session.expire_all()
    cuid = uuid.UUID(cid)
    mappings = (
        (
            await db_session.execute(
                select(UserItemMapping).where(UserItemMapping.category_id == cuid)
            )
        )
        .scalars()
        .all()
    )
    assert mappings == []
    leftover_items = (
        (await db_session.execute(select(LineItem).where(LineItem.category_id == cuid)))
        .scalars()
        .all()
    )
    assert leftover_items == []
    leftover_budgets = (
        (await db_session.execute(select(Budget).where(Budget.category_id == cuid)))
        .scalars()
        .all()
    )
    assert leftover_budgets == []
    user = await db_session.get(User, DEV_USER_ID)
    assert cid not in (user.preferences or {}).get("muted_alert_categories", [])

    # The next scan of a corrected item goes back to normal assignment.
    rescan = await _scan(client, test_image_bytes)
    again = next(
        i for i in rescan["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    assert again["category_id"] != cid


async def test_delete_unknown_category_is_404(client: AsyncClient, seeded):
    assert (await client.delete(f"/api/categories/{uuid.uuid4()}")).status_code == 404


# --- Analytics (12-analytics.md) ---


@pytest.fixture
def analytics_spy(client):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app
    from tests.api.test_analytics import SpyBackend

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    return spy


async def test_custom_category_changes_emit_the_analytics_event(
    client: AsyncClient, seeded, premium, analytics_spy
):
    """12-analytics.md: custom_category_changed {action, custom_count}."""
    cid = (await _create(client, "Garden")).json()["id"]
    await client.patch(f"/api/categories/{cid}", json={"name": "Yard"})
    await client.delete(f"/api/categories/{cid}")

    changed = [c[1] for c in analytics_spy.calls if c[0] == "custom_category_changed"]
    assert changed == [
        {"action": "created", "custom_count": 1},
        {"action": "renamed", "custom_count": 1},
        {"action": "deleted", "custom_count": 0},
    ]
