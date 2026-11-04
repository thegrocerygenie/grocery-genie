"""DoD boxes 11 and 12 on Postgres: dashboard ≤2 s and filtered history
search ≤1 s at p95, with 1,000 receipts.

SQLite timings say little about production, so these run only on Postgres
(`make backend-test-pg`). The timing is the API request through the app,
not the client render, which the device checklist covers.
"""

import os
import random
import statistics
import time
import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from app.core.seed import seed_default_categories
from app.models.database import Category, LineItem, Receipt, Store
from tests.conftest import DEV_USER_ID, ensure_user

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="p95 timings mean something only on Postgres (make backend-test-pg)",
)

RECEIPTS = 1_000
ITEMS_PER_RECEIPT = 5
RUNS = 20
TODAY = date(2026, 3, 20)


def p95(samples: list[float]) -> float:
    return statistics.quantiles(samples, n=20)[-1]


@pytest.fixture(autouse=True)
def pinned_today(monkeypatch):
    from app.core import clock

    monkeypatch.setattr(clock, "today", lambda: TODAY)


@pytest.fixture
async def thousand_receipts(client, db_session):
    """1,000 confirmed receipts over six months, 20 stores, 5 items each."""
    await ensure_user(db_session, DEV_USER_ID)
    await seed_default_categories(db_session)
    categories = [
        c.id for c in (await db_session.execute(Category.__table__.select())).all()
    ]
    stores = [
        Store(id=uuid.uuid4(), name=f"Store {n}", normalized_name=f"store {n}")
        for n in range(20)
    ]
    db_session.add_all(stores)
    rng = random.Random(7)
    receipts, items = [], []
    for n in range(RECEIPTS):
        receipt_id = uuid.uuid4()
        receipts.append(
            Receipt(
                id=receipt_id,
                user_id=DEV_USER_ID,
                store_id=stores[n % 20].id,
                # As the app saves it: the name on the receipt (V11-05).
                store_name=stores[n % 20].name,
                date=TODAY - timedelta(days=rng.randrange(180)),
                status="confirmed",
                currency="USD",
                total=0,
            )
        )
        for position in range(ITEMS_PER_RECEIPT):
            price = round(rng.uniform(1, 20), 2)
            items.append(
                LineItem(
                    receipt_id=receipt_id,
                    raw_name=f"item {rng.randrange(60)}",
                    quantity=1,
                    unit_price=price,
                    total_price=price,
                    category_id=rng.choice(categories),
                    position=position,
                )
            )
    db_session.add_all(receipts)
    await db_session.flush()
    db_session.add_all(items)
    await db_session.flush()
    resp = await client.post(
        "/api/budgets", json={"amount": 2000, "period_start": "2026-03-01"}
    )
    assert resp.status_code == 201


async def _timed(client: AsyncClient, path: str, params: dict) -> list[float]:
    await client.get(path, params=params)  # warm-up
    samples = []
    for _ in range(RUNS):
        start = time.perf_counter()
        resp = await client.get(path, params=params)
        samples.append(time.perf_counter() - start)
        assert resp.status_code == 200, resp.text
    return samples


async def test_dashboard_p95_under_2s(client, thousand_receipts):
    samples = await _timed(client, "/api/dashboard/spending", {"period": "2026-03"})

    print(f"dashboard p95 {p95(samples) * 1000:.0f} ms over {RUNS} runs")
    assert p95(samples) <= 2.0


async def test_dashboard_12_month_trend_p95_under_2s(client, thousand_receipts):
    # The 12-month trend (Premium, V1.1) runs the per-month queries 4x as often.
    from app.core.entitlements import user_is_premium
    from main import app

    app.dependency_overrides[user_is_premium] = lambda: True
    try:
        samples = await _timed(
            client, "/api/dashboard/spending", {"period": "2026-03", "months": 12}
        )
    finally:
        app.dependency_overrides.pop(user_is_premium, None)

    print(f"12-month dashboard p95 {p95(samples) * 1000:.0f} ms over {RUNS} runs")
    assert p95(samples) <= 2.0


async def test_filtered_history_search_p95_under_1s(client, thousand_receipts):
    params = {
        "store": "store 7",
        "from_date": "2026-01-01",
        "to_date": "2026-03-20",
        "page": 1,
        "per_page": 20,
    }
    samples = await _timed(client, "/api/receipts", params)
    found = (await client.get("/api/receipts", params=params)).json()["total"]

    print(f"history search p95 {p95(samples) * 1000:.0f} ms, {found} matches")
    assert found > 0
    assert p95(samples) <= 1.0
