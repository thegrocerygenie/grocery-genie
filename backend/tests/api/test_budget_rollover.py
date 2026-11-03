"""BC-FR Budget Management: "Rollover: unspent budget does not roll over by
default. Optional rollover toggle (premium)." (V11-P3, decision D2).

Rules (docs/prd/07-data-model.md, Budget):
- Only unspent budget carries; overspend does not (the PRD says "unspent").
- Turning rollover on carries last period's unspent into this one (when the
  budget existed last period), then each period's unspent, including what
  rolled into it, carries into the next.
- The carry is derived from the budget and its receipts, so reading it never
  writes and two reads always agree.
- Premium decides whether the carry applies; while it lapses, the budget is
  its base amount and the stored toggle is kept.

Today is pinned to 2026-03-20 (tests/conftest.py).
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.seed import seed_default_categories
from app.models.database import Budget, Category, User
from tests.conftest import DEV_USER_ID


@pytest.fixture
async def seeded(db_session: AsyncSession) -> AsyncSession:
    await seed_default_categories(db_session)
    await db_session.commit()
    return db_session


async def _set_premium(db_session: AsyncSession, on: bool) -> None:
    user = await db_session.get(User, DEV_USER_ID)
    user.premium_active = on
    user.premium_expires_at = (
        datetime.now(UTC) + timedelta(days=3650) if on else datetime.now(UTC)
    )
    await db_session.flush()


@pytest.fixture
async def premium(client: AsyncClient, db_session: AsyncSession) -> None:
    await _set_premium(db_session, True)


def _pin_today(monkeypatch, day: str) -> None:
    """Pin the server's today, and its now to noon that day."""
    pinned = date.fromisoformat(day)
    noon = datetime(pinned.year, pinned.month, pinned.day, 12, tzinfo=UTC)
    monkeypatch.setattr(clock, "today", lambda: pinned)
    monkeypatch.setattr(clock, "now", lambda: noon)


async def _budget(
    client: AsyncClient,
    amount: float,
    period_start: str = "2026-02-01",
    category_id: str | None = None,
) -> str:
    resp = await client.post(
        "/api/budgets",
        json={
            "category_id": category_id,
            "amount": amount,
            "period_type": "monthly",
            "period_start": period_start,
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _spend(
    client: AsyncClient,
    amount: float,
    on: str,
    category_id: str | None = None,
) -> None:
    item = {"name": "Groceries", "quantity": 1, "unit_price": amount}
    item["total_price"] = amount
    if category_id is not None:
        item["category_id"] = category_id
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": on,
            "total": amount,
            "items": [item],
        },
    )
    assert resp.status_code == 201, resp.text


async def _rollover(client: AsyncClient, budget_id: str, enabled: bool):
    return await client.put(
        f"/api/budgets/{budget_id}/rollover", json={"enabled": enabled}
    )


async def _overall(client: AsyncClient, period: str = "2026-03") -> dict:
    resp = await client.get("/api/budgets/summary", params={"period": period})
    assert resp.status_code == 200
    return resp.json()["overall"]


async def _alert_thresholds(client: AsyncClient) -> list[int]:
    resp = await client.get("/api/notifications", params={"per_page": 100})
    titles = [
        n["title"] for n in resp.json()["items"] if n["type"] == "budget_threshold"
    ]
    return sorted(
        100 if t == "Budget Exceeded" else int(t.split()[1].rstrip("%")) for t in titles
    )


async def _category_id(db_session: AsyncSession, name: str) -> str:
    result = await db_session.execute(select(Category.id).where(Category.name == name))
    return str(result.scalar_one())


# --- Premium gate (D2) ---


async def test_free_user_turning_rollover_on_gets_premium_required(
    client: AsyncClient, seeded
):
    budget_id = await _budget(client, 100.0)

    resp = await _rollover(client, budget_id, True)

    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "premium_required"
    assert resp.json()["detail"]["feature"] == "budget_rollover"
    budgets = (await client.get("/api/budgets")).json()
    assert budgets[0]["rollover_enabled"] is False


async def test_rollover_is_off_by_default(client: AsyncClient, seeded, premium):
    await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")

    overall = await _overall(client)

    assert overall["budget"] == 100.0
    assert overall["rolled_over"] == 0.0


async def test_premium_user_turns_rollover_on_and_off(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0)

    on = await _rollover(client, budget_id, True)
    assert on.status_code == 200
    assert on.json()["rollover_enabled"] is True
    assert (await client.get("/api/budgets")).json()[0]["rollover_enabled"] is True

    off = await _rollover(client, budget_id, False)
    assert off.status_code == 200
    assert off.json()["rollover_enabled"] is False


async def test_rollover_for_an_unknown_budget_is_404(
    client: AsyncClient, seeded, premium
):
    resp = await _rollover(client, "00000000-0000-0000-0000-00000000dead", True)
    assert resp.status_code == 404


# --- The carry ---


async def test_last_periods_unspent_rolls_into_this_period(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0, period_start="2026-02-01")
    await _spend(client, 60.0, "2026-02-10")
    await _spend(client, 30.0, "2026-03-05")

    await _rollover(client, budget_id, True)
    overall = await _overall(client)

    # 100 base + 40 unspent in February.
    assert overall["budget"] == 140.0
    assert overall["rolled_over"] == 40.0
    assert overall["spent"] == 30.0
    assert overall["remaining"] == 110.0
    assert overall["percent"] == round(30 / 140 * 100, 1)


async def test_next_periods_limit_includes_this_periods_unspent(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0, period_start="2026-02-01")
    await _spend(client, 60.0, "2026-02-10")
    await _spend(client, 30.0, "2026-03-05")
    await _rollover(client, budget_id, True)

    april = await _overall(client, "2026-04")

    # March: 140 limit, 30 spent so far, so 110 carries into April.
    assert april["rolled_over"] == 110.0
    assert april["budget"] == 210.0


async def test_overspend_does_not_carry(client: AsyncClient, seeded, premium):
    budget_id = await _budget(client, 100.0, period_start="2026-02-01")
    await _spend(client, 130.0, "2026-02-10")

    await _rollover(client, budget_id, True)
    overall = await _overall(client)

    assert overall["rolled_over"] == 0.0
    assert overall["budget"] == 100.0


async def test_a_budget_created_this_period_has_nothing_to_carry_yet(
    client: AsyncClient, seeded, premium
):
    # Created mid-March: February predates it, so none of it carries.
    budget_id = await _budget(client, 100.0, period_start="2026-03-01")
    await _spend(client, 10.0, "2026-02-10")
    await _spend(client, 25.0, "2026-03-02")

    await _rollover(client, budget_id, True)

    assert (await _overall(client))["rolled_over"] == 0.0
    # The partial first period counts in full: its whole-period spend against
    # its whole amount, as its progress bar shows.
    assert (await _overall(client, "2026-04"))["rolled_over"] == 75.0


async def test_periods_before_rollover_was_turned_on_do_not_carry(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0, period_start="2026-01-01")
    await _spend(client, 10.0, "2026-01-10")  # 90 unspent in January
    await _spend(client, 50.0, "2026-02-10")  # 50 unspent in February

    await _rollover(client, budget_id, True)

    # Only February (the period before it was turned on) seeds the carry.
    assert (await _overall(client))["rolled_over"] == 50.0
    assert (await _overall(client, "2026-02"))["rolled_over"] == 0.0


async def test_carry_compounds_across_periods(
    client: AsyncClient, seeded, premium, monkeypatch
):
    _pin_today(monkeypatch, "2026-02-10")
    budget_id = await _budget(client, 100.0, period_start="2026-01-01")
    await _spend(client, 70.0, "2026-01-15")
    await _rollover(client, budget_id, True)  # January's 30 rolls into February
    await _spend(client, 100.0, "2026-02-12")

    _pin_today(monkeypatch, "2026-03-20")
    overall = await _overall(client)

    # February: 130 limit, 100 spent: 30 carries on into March.
    assert overall["rolled_over"] == 30.0
    assert overall["budget"] == 130.0


async def test_category_budget_carries_its_own_unspent(
    client: AsyncClient, seeded, db_session, premium
):
    groceries = await _category_id(db_session, "Groceries")
    household = await _category_id(db_session, "Household")
    await _budget(client, 500.0)
    budget_id = await _budget(client, 80.0, category_id=groceries)
    await _spend(client, 50.0, "2026-02-10", category_id=groceries)
    await _spend(client, 200.0, "2026-02-11", category_id=household)

    await _rollover(client, budget_id, True)
    resp = await client.get("/api/budgets/summary", params={"period": "2026-03"})
    category = next(
        c for c in resp.json()["categories"] if c["category_id"] == groceries
    )

    assert category["rolled_over"] == 30.0
    assert category["budget"] == 110.0
    # The overall budget did not turn rollover on.
    assert resp.json()["overall"]["rolled_over"] == 0.0


async def test_zero_budget_never_carries(client: AsyncClient, seeded, premium):
    # EC Budget 2: a $0 budget means "spend nothing" and alerts on any spend.
    budget_id = await _budget(client, 0.0)

    await _rollover(client, budget_id, True)

    assert (await _overall(client))["rolled_over"] == 0.0


async def test_reading_the_carry_is_deterministic_and_writes_nothing(
    client: AsyncClient, seeded, db_session, premium
):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)
    again = await _rollover(client, budget_id, True)  # idempotent

    first = await _overall(client)
    second = await _overall(client)
    dashboard = (await client.get("/api/dashboard/spending?period=2026-03")).json()

    assert again.status_code == 200
    assert first == second
    assert dashboard["overall"] == first
    assert first["rolled_over"] == 40.0
    assert not db_session.dirty and not db_session.new


# --- Edge cases (docs/prd/11-edge-cases.md) ---


async def test_amount_change_applies_from_now_and_keeps_the_carry(
    client: AsyncClient, seeded, premium
):
    # EC Budget 1: a new amount applies to the rest of the period; spending
    # already done is not recalculated against it.
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)

    resp = await client.patch(f"/api/budgets/{budget_id}", json={"amount": 200.0})
    assert resp.status_code == 200
    overall = await _overall(client)

    # February's 40 stays; February is not re-scored against 200.
    assert overall["rolled_over"] == 40.0
    assert overall["budget"] == 240.0


async def test_start_day_change_keeps_the_carry(client: AsyncClient, seeded, premium):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)

    resp = await client.patch(
        f"/api/budgets/{budget_id}",
        json={"amount": 100.0, "period_start": "2026-03-10"},
    )
    assert resp.status_code == 200

    # The period is now March 10 to April 9; the carry moves with it.
    assert (await _overall(client))["rolled_over"] == 40.0


async def test_restoring_a_budget_deleted_in_an_earlier_period_restarts_rollover(
    client: AsyncClient, seeded, premium, monkeypatch
):
    _pin_today(monkeypatch, "2026-02-10")
    budget_id = await _budget(client, 100.0, period_start="2026-01-01")
    await _rollover(client, budget_id, True)
    assert (await client.delete(f"/api/budgets/{budget_id}")).status_code == 204

    _pin_today(monkeypatch, "2026-03-05")
    resp = await client.post(f"/api/budgets/{budget_id}/restore")
    assert resp.status_code == 200
    assert resp.json()["rollover_enabled"] is True

    # Nothing carries from the periods it was deleted in.
    overall = await _overall(client)
    assert overall["rolled_over"] == 0.0
    assert (await _overall(client, "2026-04"))["rolled_over"] == 100.0


async def test_restoring_within_the_same_period_keeps_the_carry(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)
    await client.delete(f"/api/budgets/{budget_id}")

    resp = await client.post(f"/api/budgets/{budget_id}/restore")
    assert resp.status_code == 200

    assert (await _overall(client))["rolled_over"] == 40.0


async def test_currency_change_restarts_rollover(client: AsyncClient, seeded, premium):
    # EC Budget 4: amounts are not converted, so a carry in the old currency
    # does not carry into the new one.
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)

    resp = await client.patch("/api/users/me", json={"currency_preference": "EUR"})
    assert resp.status_code == 200

    overall = await _overall(client)
    assert overall["rolled_over"] == 0.0
    assert overall["budget"] == 100.0


async def test_premium_lapse_pauses_rollover_and_keeps_the_toggle(
    client: AsyncClient, seeded, db_session, premium
):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)

    await _set_premium(db_session, False)
    lapsed = await _overall(client)
    assert lapsed["rolled_over"] == 0.0
    assert lapsed["budget"] == 100.0
    assert (await client.get("/api/budgets")).json()[0]["rollover_enabled"] is True

    await _set_premium(db_session, True)
    assert (await _overall(client))["rolled_over"] == 40.0


# --- Threshold alerts on the effective limit (BC-03) ---


async def test_threshold_alert_fires_on_the_effective_limit(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)  # March limit: 140

    await _spend(client, 112.0, "2026-03-15")  # 80% of 140, 112% of 100

    assert await _alert_thresholds(client) == [50, 80]


async def test_late_receipt_in_last_period_shrinks_the_carry_and_alerts(
    client: AsyncClient, seeded, premium
):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)  # March limit: 140
    await _spend(client, 100.0, "2026-03-15")  # 71%
    assert await _alert_thresholds(client) == [50]

    # A February receipt confirmed late uses up February's 40: the March
    # limit drops to 100, which March's spend has reached.
    await _spend(client, 40.0, "2026-02-20")

    assert (await _overall(client))["budget"] == 100.0
    assert await _alert_thresholds(client) == [50, 80, 100]


async def test_lapsed_premium_alerts_on_the_base_amount(
    client: AsyncClient, seeded, db_session, premium
):
    budget_id = await _budget(client, 100.0)
    await _spend(client, 60.0, "2026-02-10")
    await _rollover(client, budget_id, True)
    await _set_premium(db_session, False)

    await _spend(client, 100.0, "2026-03-15")

    assert await _alert_thresholds(client) == [50, 80, 100]


async def test_budget_row_keeps_the_rollover_run(
    client: AsyncClient, seeded, db_session, premium
):
    budget_id = await _budget(client, 100.0)
    await _rollover(client, budget_id, True)

    budget = (await db_session.execute(select(Budget))).scalar_one()
    assert str(budget.id) == budget_id
    assert budget.rollover_start == date(2026, 2, 1)
    assert float(budget.rollover_opening) == 0.0

    await _rollover(client, budget_id, False)
    await db_session.refresh(budget)
    assert budget.rollover_start is None


# --- Analytics (docs/prd/12-analytics.md) ---


async def test_toggling_rollover_emits_analytics(client: AsyncClient, seeded, premium):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app
    from tests.api.test_analytics import SpyBackend

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    budget_id = await _budget(client, 100.0)

    await _rollover(client, budget_id, True)
    await _rollover(client, budget_id, False)

    toggles = [c[1] for c in spy.calls if c[0] == "budget_rollover_toggled"]
    assert toggles == [
        {"enabled": True, "type": "overall"},
        {"enabled": False, "type": "overall"},
    ]
