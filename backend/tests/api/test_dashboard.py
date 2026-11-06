import uuid
from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.seed import seed_default_categories
from app.models.database import Category, LineItem, Receipt
from tests.conftest import DEV_USER_ID, USER_B_ID, ensure_user


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


def pin_now(monkeypatch, instant: str) -> None:
    """Pin the server's clock to ``instant`` (ISO, UTC)."""
    moment = datetime.fromisoformat(instant).replace(tzinfo=UTC)
    monkeypatch.setattr(clock, "now", lambda: moment)


async def set_reset_day(client: AsyncClient, period_start: str) -> None:
    response = await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 500.0,
            "period_type": "monthly",
            "period_start": period_start,
        },
    )
    assert response.status_code in (200, 201)


@pytest.mark.asyncio
async def test_dashboard_default_current_month(
    client: AsyncClient, seeded_db, monkeypatch
):
    pin_now(monkeypatch, "2026-10-10T12:00:00")
    response = await client.get("/api/dashboard/spending")
    assert response.status_code == 200
    data = response.json()
    assert data["period"] == "2026-10"
    assert data["period_start"] == "2026-10-01"
    assert data["period_end"] == "2026-10-31"


@pytest.mark.asyncio
async def test_dashboard_default_period_follows_the_reset_day(
    client: AsyncClient, seeded_db, monkeypatch
):
    # Reset day 15: October 10 falls in the period that began September 15.
    await set_reset_day(client, "2026-09-15")
    pin_now(monkeypatch, "2026-10-10T12:00:00")
    response = await client.get("/api/dashboard/spending")
    data = response.json()
    assert data["period"] == "2026-09"
    assert data["period_start"] == "2026-09-15"
    assert data["period_end"] == "2026-10-14"
    assert data["previous_period"] == "2026-08"


@pytest.mark.asyncio
async def test_dashboard_default_period_is_new_on_the_reset_day(
    client: AsyncClient, seeded_db, monkeypatch
):
    await set_reset_day(client, "2026-09-15")
    pin_now(monkeypatch, "2026-10-15T12:00:00")
    data = (await client.get("/api/dashboard/spending")).json()
    assert data["period"] == "2026-10"
    assert data["period_start"] == "2026-10-15"
    assert data["period_end"] == "2026-11-14"


@pytest.mark.asyncio
async def test_dashboard_default_period_uses_the_users_local_date(
    stored_client: AsyncClient, seeded_db, monkeypatch
):
    # 03:00 UTC on October 15 is still October 14 in New York, the last day
    # of the period that began September 15.
    patched = await stored_client.patch(
        "/api/users/me", json={"timezone": "America/New_York"}
    )
    assert patched.status_code == 200
    await set_reset_day(stored_client, "2026-09-15")
    pin_now(monkeypatch, "2026-10-15T03:00:00")
    data = (await stored_client.get("/api/dashboard/spending")).json()
    assert data["period"] == "2026-09"
    assert data["period_end"] == "2026-10-14"


@pytest.mark.asyncio
async def test_dashboard_named_period_returns_its_own_dates(
    client: AsyncClient, seeded_db
):
    await set_reset_day(client, "2026-03-15")
    data = (await client.get("/api/dashboard/spending?period=2026-03")).json()
    assert data["period"] == "2026-03"
    assert data["period_start"] == "2026-03-15"
    assert data["period_end"] == "2026-04-14"


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
    await ensure_user(db_session, user_id)
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


# L7: the Budget tab said "Scan your first receipt" to a user whose receipts
# are all in other months. has_receipts tells the app the account isn't new.
@pytest.mark.asyncio
async def test_dashboard_has_no_receipts_for_a_new_account(
    client: AsyncClient, seeded_db, db_session
):
    # Another user's receipt, and a receipt in Recently Deleted, don't count.
    await _add_receipt(db_session, date(2026, 3, 10), [(None, 5.0)], user_id=USER_B_ID)
    await _add_receipt(db_session, date(2026, 3, 10), [(None, 5.0)])
    receipt = (
        await db_session.execute(
            Receipt.__table__.select().where(Receipt.user_id == DEV_USER_ID)
        )
    ).first()
    await db_session.execute(
        Receipt.__table__.update()
        .where(Receipt.id == receipt.id)
        .values(deleted_at=date(2026, 3, 11))
    )
    await db_session.commit()

    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.json()["has_receipts"] is False


@pytest.mark.asyncio
async def test_dashboard_has_receipts_from_another_month(
    client: AsyncClient, seeded_db, db_session
):
    await _add_receipt(db_session, date(2026, 1, 10), [(None, 5.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03")

    data = response.json()
    assert data["overall"]["spent"] == 0
    assert data["has_receipts"] is True


# --- V1.1 BC-FR "expandable to 12 in V1.1": months=3|12, 12 is Premium (D2) ---


@pytest.fixture
def premium_user():
    """Grant Premium through the one entitlement check, for this test only."""
    from app.core.entitlements import user_is_premium
    from main import app

    app.dependency_overrides[user_is_premium] = lambda: True
    yield
    app.dependency_overrides.pop(user_is_premium, None)


@pytest.mark.asyncio
async def test_dashboard_trend_is_3_months_with_months_3(
    client: AsyncClient, seeded_db
):
    response = await client.get("/api/dashboard/spending?period=2026-03&months=3")

    assert response.status_code == 200
    assert [m["period"] for m in response.json()["trend"]] == [
        "2026-01",
        "2026-02",
        "2026-03",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "months", ["0", "2", "4", "13", "24", "abc", "-3", "", "ALL", "1.0"]
)
async def test_dashboard_rejects_months_outside_the_ranges(
    client: AsyncClient, seeded_db, premium_user, months
):
    response = await client.get(
        f"/api/dashboard/spending?period=2026-03&months={months}"
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_dashboard_12_month_trend_needs_premium(client: AsyncClient, seeded_db):
    response = await client.get("/api/dashboard/spending?period=2026-03&months=12")

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "premium_required"
    assert detail["feature"] == "trend_12_months"
    assert detail["message"]


@pytest.mark.asyncio
async def test_dashboard_12_month_trend_for_premium(
    client: AsyncClient, seeded_db, db_session, premium_user
):
    groceries = await _category_id(db_session, "Groceries")
    await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 500.0,
            "period_type": "monthly",
            "period_start": "2025-01-01",
        },
    )
    # Inside the window: its first month (Apr 2025), across the year, its last.
    await _add_receipt(db_session, date(2025, 4, 2), [(groceries, 40.0)])
    await _add_receipt(db_session, date(2025, 12, 31), [(None, 7.5)])
    await _add_receipt(db_session, date(2026, 3, 15), [(groceries, 30.0)])
    # The month before the window: in prior_average only.
    await _add_receipt(db_session, date(2025, 3, 31), [(groceries, 1200.0)])
    # History from before the prior window, so it is compared (BC-04 AC 7).
    await _add_receipt(db_session, date(2024, 3, 20), [(None, 5.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03&months=12")

    assert response.status_code == 200
    data = response.json()
    trend = data["trend"]
    assert [m["period"] for m in trend] == [
        "2025-04",
        "2025-05",
        "2025-06",
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
        "2026-03",
    ]
    spent = {m["period"]: m["spent"] for m in trend}
    assert spent["2025-04"] == 40.0
    assert spent["2025-12"] == 7.5
    assert spent["2026-03"] == 30.0
    assert sum(spent.values()) == 77.5
    assert all(m["budget"] == 500.0 for m in trend)
    assert trend[8]["categories"] == [
        {"category_id": None, "name": "Uncategorized", "spent": 7.5}
    ]
    # The 12 months before the window (Apr 2024 - Mar 2025): 1200 / 12.
    assert data["prior_average"] == 100.0
    # The rest of the dashboard is still about `period`.
    assert data["overall"]["spent"] == 30.0
    assert data["previous_period"] == "2026-02"


@pytest.mark.asyncio
async def test_dashboard_premium_user_still_gets_3_months_by_default(
    client: AsyncClient, seeded_db, premium_user
):
    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert len(response.json()["trend"]) == 3


# --- BC-04 AC 6 (DA-10): range chips 1M, 3M, 6M, 1Y, All; over 3 is Premium ---


@pytest.mark.asyncio
async def test_dashboard_1_month_trend_compares_with_the_month_before(
    client: AsyncClient, seeded_db, db_session
):
    groceries = await _category_id(db_session, "Groceries")
    await _add_receipt(db_session, date(2026, 2, 10), [(groceries, 80.0)])
    await _add_receipt(db_session, date(2026, 3, 10), [(groceries, 60.0)])
    # History from before February, so it is compared (BC-04 AC 7).
    await _add_receipt(db_session, date(2026, 1, 5), [(None, 7.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03&months=1")

    assert response.status_code == 200
    data = response.json()
    assert [(m["period"], m["spent"]) for m in data["trend"]] == [("2026-03", 60.0)]
    # The month before the window: February.
    assert data["prior_average"] == 80.0


@pytest.mark.asyncio
async def test_dashboard_6_month_trend_for_premium(
    client: AsyncClient, seeded_db, db_session, premium_user
):
    groceries = await _category_id(db_session, "Groceries")
    # Window Oct 2025 - Mar 2026; prior window Apr - Sep 2025.
    await _add_receipt(db_session, date(2025, 10, 1), [(groceries, 12.0)])
    await _add_receipt(db_session, date(2026, 3, 31), [(groceries, 24.0)])
    await _add_receipt(db_session, date(2025, 9, 30), [(groceries, 60.0)])
    await _add_receipt(db_session, date(2025, 4, 1), [(groceries, 60.0)])
    # Outside both windows, another user's, a pending scan: none count.
    await _add_receipt(db_session, date(2025, 3, 31), [(groceries, 999.0)])
    await _add_receipt(
        db_session, date(2026, 1, 5), [(groceries, 999.0)], user_id=USER_B_ID
    )
    await _add_receipt(
        db_session, date(2026, 1, 6), [(groceries, 999.0)], status="pending"
    )

    response = await client.get("/api/dashboard/spending?period=2026-03&months=6")

    assert response.status_code == 200
    data = response.json()
    assert [(m["period"], m["spent"]) for m in data["trend"]] == [
        ("2025-10", 12.0),
        ("2025-11", 0.0),
        ("2025-12", 0.0),
        ("2026-01", 0.0),
        ("2026-02", 0.0),
        ("2026-03", 24.0),
    ]
    assert data["prior_average"] == 20.0


@pytest.mark.asyncio
async def test_dashboard_all_trend_starts_at_the_first_receipt(
    client: AsyncClient, seeded_db, db_session, premium_user
):
    groceries = await _category_id(db_session, "Groceries")
    await _add_receipt(db_session, date(2025, 11, 20), [(groceries, 15.0)])
    await _add_receipt(db_session, date(2026, 3, 2), [(None, 5.0)])
    # Earlier, but not this user's first receipt: another user's, a pending
    # scan, one in Recently Deleted.
    await _add_receipt(
        db_session, date(2024, 1, 5), [(groceries, 9.0)], user_id=USER_B_ID
    )
    await _add_receipt(
        db_session, date(2024, 2, 5), [(groceries, 9.0)], status="pending"
    )
    await _add_receipt(db_session, date(2024, 3, 5), [(groceries, 9.0)])
    await db_session.execute(
        Receipt.__table__.update()
        .where(Receipt.date == date(2024, 3, 5))
        .values(deleted_at=date(2024, 3, 6))
    )
    await db_session.commit()

    response = await client.get("/api/dashboard/spending?period=2026-03&months=all")

    assert response.status_code == 200
    data = response.json()
    assert [(m["period"], m["spent"]) for m in data["trend"]] == [
        ("2025-11", 15.0),
        ("2025-12", 0.0),
        ("2026-01", 0.0),
        ("2026-02", 0.0),
        ("2026-03", 5.0),
    ]
    assert data["trend"][-1]["categories"] == [
        {"category_id": None, "name": "Uncategorized", "spent": 5.0}
    ]
    # Nothing comes before the first receipt (BC-04 AC 7: no change for All).
    assert data["prior_average"] == 0.0


@pytest.mark.asyncio
async def test_dashboard_all_trend_without_earlier_receipts_is_the_period(
    client: AsyncClient, seeded_db, db_session, premium_user
):
    # Only a receipt after the period: All is just the period itself.
    await _add_receipt(db_session, date(2026, 5, 1), [(None, 5.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03&months=all")

    data = response.json()
    assert [(m["period"], m["spent"]) for m in data["trend"]] == [("2026-03", 0.0)]
    assert data["prior_average"] == 0.0


@pytest.mark.asyncio
async def test_dashboard_all_trend_follows_the_reset_day(
    client: AsyncClient, seeded_db, db_session, premium_user
):
    # Reset day 15: December 10 is in the period that began November 15.
    await set_reset_day(client, "2025-01-15")
    await _add_receipt(db_session, date(2025, 12, 10), [(None, 7.0)])
    await _add_receipt(db_session, date(2026, 1, 14), [(None, 3.0)])

    response = await client.get("/api/dashboard/spending?period=2026-01&months=all")

    assert [(m["period"], m["spent"]) for m in response.json()["trend"]] == [
        ("2025-11", 7.0),
        ("2025-12", 3.0),
        ("2026-01", 0.0),
    ]


@pytest.mark.asyncio
async def test_dashboard_names_the_current_period(
    client: AsyncClient, seeded_db, monkeypatch
):
    # BC-04 AC 8, 9: the app tints the current month and leaves it out of Lowest.
    await set_reset_day(client, "2026-09-15")
    pin_now(monkeypatch, "2026-10-10T12:00:00")

    past = (await client.get("/api/dashboard/spending?period=2026-03")).json()
    now = (await client.get("/api/dashboard/spending")).json()

    assert past["current_period"] == "2026-09"
    assert now["current_period"] == now["period"] == "2026-09"


# --- BC-04 AC 7: no change from the months before unless the user's history
# covers them. Averaging 4 months of spend over 12 read "+196% YoY" for an
# account that began inside the prior window (Simulator, 2026-11-05).


@pytest.mark.asyncio
async def test_dashboard_prior_average_is_zero_when_history_starts_inside_it(
    client: AsyncClient, seeded_db, db_session, premium_user
):
    # The 12 months before Apr 2025 - Mar 2026 are Apr 2024 - Mar 2025; the
    # first receipt is in Dec 2024, so 8 of them have no history at all.
    await _add_receipt(db_session, date(2024, 12, 10), [(None, 400.0)])
    await _add_receipt(db_session, date(2026, 3, 10), [(None, 400.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03&months=12")

    assert response.json()["prior_average"] == 0.0


@pytest.mark.asyncio
async def test_dashboard_prior_average_counts_when_history_starts_with_it(
    client: AsyncClient, seeded_db, db_session
):
    # Prior window Oct - Dec 2025, history from its first day.
    await _add_receipt(db_session, date(2025, 10, 1), [(None, 90.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.json()["prior_average"] == 30.0


@pytest.mark.asyncio
async def test_dashboard_prior_average_follows_the_reset_day(
    client: AsyncClient, seeded_db, db_session
):
    # Reset day 15: the prior window for 2026-03 is periods 2025-10 to 2025-12,
    # from 2025-10-15. A first receipt on Dec 20 is inside it, so there is no
    # full window to compare.
    await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 500.0,
            "period_type": "monthly",
            "period_start": "2025-01-15",
        },
    )
    await _add_receipt(db_session, date(2025, 12, 20), [(None, 90.0)])

    response = await client.get("/api/dashboard/spending?period=2026-03")

    assert response.json()["prior_average"] == 0.0
