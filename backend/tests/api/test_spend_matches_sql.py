"""DoD box 16: budget spend equals the sum of confirmed line items.

The proof the box names is a SQL query against test data, so this compares
the API's totals with a hand-written SUM that shares no code with
BudgetService. The data includes every row the rule must leave out: a
pending receipt, a deleted one, one in another currency, one in another
period, and another user's.
"""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import Numeric, Uuid, bindparam, column, select, text

from app.core.seed import seed_default_categories
from app.models.database import Category, LineItem, Receipt
from tests.conftest import DEV_USER_ID, USER_B_ID, ensure_user

PERIOD = "2026-03"

INDEPENDENT_SUM = (
    text(
        """
    SELECT li.category_id AS category_id, COALESCE(SUM(li.total_price), 0) AS total
    FROM line_items li
    JOIN receipts r ON r.id = li.receipt_id
    JOIN users u ON u.id = r.user_id
    WHERE r.user_id = :user_id
      AND r.status = 'confirmed'
      AND r.deleted_at IS NULL
      AND r.currency = u.currency_preference
      AND r.date >= :start AND r.date <= :end
    GROUP BY li.category_id
    """
    )
    .bindparams(bindparam("user_id", type_=Uuid))
    .columns(
        # Typed so SQLite and Postgres both give UUIDs back.
        column("category_id", Uuid),
        column("total", Numeric),
    )
)


@pytest.fixture(autouse=True)
def pinned_today(monkeypatch):
    from app.core import clock

    monkeypatch.setattr(clock, "today", lambda: date(2026, 3, 20))


async def _receipt(db, *, items, user_id=DEV_USER_ID, on=date(2026, 3, 10), **kw):
    receipt = Receipt(
        user_id=user_id,
        date=on,
        status=kw.get("status", "confirmed"),
        currency=kw.get("currency", "USD"),
        deleted_at=kw.get("deleted_at"),
    )
    db.add(receipt)
    await db.flush()
    for position, (category_id, price) in enumerate(items):
        db.add(
            LineItem(
                receipt_id=receipt.id,
                raw_name=f"item {position}",
                quantity=1,
                unit_price=price,
                total_price=price,
                category_id=category_id,
                position=position,
            )
        )
    await db.flush()


async def test_budget_spend_equals_an_independent_sql_sum(client, db_session):
    await seed_default_categories(db_session)
    await ensure_user(db_session, USER_B_ID)
    cats = {
        c.name: c.id
        for c in (await db_session.execute(select(Category))).scalars()
        if c.user_id is None
    }
    groceries, household = cats["Groceries"], cats["Household"]
    resp = await client.post(
        "/api/budgets", json={"amount": 500, "period_start": "2026-03-01"}
    )
    assert resp.status_code == 201

    # Counted.
    await _receipt(db_session, items=[(groceries, 12.34), (household, 5.01)])
    await _receipt(db_session, items=[(groceries, 0.10), (None, 7.77)])
    await _receipt(db_session, on=date(2026, 3, 31), items=[(household, 2.50)])
    # Left out.
    await _receipt(db_session, items=[(groceries, 100.0)], status="pending_review")
    await _receipt(db_session, items=[(groceries, 200.0)], deleted_at=datetime.now(UTC))
    await _receipt(db_session, items=[(groceries, 300.0)], currency="EUR")
    await _receipt(db_session, on=date(2026, 2, 28), items=[(groceries, 400.0)])
    await _receipt(db_session, user_id=USER_B_ID, items=[(groceries, 500.0)])

    rows = (
        await db_session.execute(
            INDEPENDENT_SUM,
            {
                "user_id": DEV_USER_ID,
                "start": date(2026, 3, 1),
                "end": date(2026, 3, 31),
            },
        )
    ).all()
    by_category = {category_id: round(float(total), 2) for category_id, total in rows}
    expected_total = round(sum(by_category.values()), 2)
    assert expected_total == 27.72  # the hand-picked counted rows

    summary = (
        await client.get("/api/budgets/summary", params={"period": PERIOD})
    ).json()
    assert summary["overall"]["spent"] == expected_total

    dashboard = (
        await client.get("/api/dashboard/spending", params={"period": PERIOD})
    ).json()
    month = next(m for m in dashboard["trend"] if m["period"] == PERIOD)
    assert round(month["spent"], 2) == expected_total
    trend_by_category = {
        c["category_id"]: round(c["spent"], 2) for c in month["categories"]
    }
    assert trend_by_category == {
        (str(k) if k else None): v for k, v in by_category.items()
    }
