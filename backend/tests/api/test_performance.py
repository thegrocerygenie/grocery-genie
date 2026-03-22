"""Performance benchmarks for MVP non-functional requirements.

These tests verify:
- Dashboard API responds in <2 seconds with 100 receipts x 10 items
- Receipt history responds in <1 second with 1,000 receipts

NOTE: Tests run against SQLite in-memory, which differs from production
PostgreSQL. Production benchmarks should use testcontainers with PostgreSQL
for representative numbers.
"""

import time
import uuid
from datetime import date, timedelta

import pytest

from app.models.database import Category, LineItem, Receipt
from tests.conftest import DEV_USER_ID


@pytest.fixture
async def category(db_session):
    cat = Category(id=uuid.uuid4(), name="Groceries", is_default=True, sort_order=0)
    db_session.add(cat)
    await db_session.flush()
    return cat


@pytest.mark.asyncio
async def test_dashboard_100_receipts_under_2s(client, db_session, category):
    """GET /api/dashboard/spending < 2 seconds with 100 receipts x 10 items."""
    # Create overall budget
    await client.post(
        "/api/budgets",
        json={
            "amount": 5000.0,
            "period_start": "2026-03-01",
        },
    )

    # Create 100 confirmed receipts, each with 10 line items
    base_date = date(2026, 3, 1)
    for i in range(100):
        receipt = Receipt(
            user_id=DEV_USER_ID,
            date=base_date + timedelta(days=i % 28),
            status="confirmed",
            currency="USD",
            total=float((i + 1) * 10),
        )
        db_session.add(receipt)
        await db_session.flush()

        for j in range(10):
            li = LineItem(
                receipt_id=receipt.id,
                raw_name=f"Item {j}",
                quantity=1,
                unit_price=float(j + 1),
                total_price=float(j + 1),
                category_id=category.id,
            )
            db_session.add(li)

    await db_session.commit()

    # Benchmark
    start = time.monotonic()
    response = await client.get("/api/dashboard/spending?period=2026-03")
    elapsed = time.monotonic() - start

    assert response.status_code == 200
    data = response.json()
    assert data["overall"]["spent"] > 0
    assert elapsed < 2.0, f"Dashboard took {elapsed:.2f}s, target is <2s"


@pytest.mark.asyncio
async def test_receipt_history_1000_receipts_under_1s(client, db_session, category):
    """GET /api/receipts < 1 second with 1,000 receipts."""
    base_date = date(2026, 1, 1)

    # Batch insert — flush receipts first to get IDs, then add items
    for batch_start in range(0, 1000, 100):
        receipts = []
        for i in range(batch_start, min(batch_start + 100, 1000)):
            receipt = Receipt(
                user_id=DEV_USER_ID,
                date=base_date + timedelta(days=i % 365),
                status="confirmed",
                currency="USD",
                total=float(i + 1),
            )
            db_session.add(receipt)
            receipts.append((receipt, i))

        await db_session.flush()

        for receipt, i in receipts:
            li = LineItem(
                receipt_id=receipt.id,
                raw_name=f"Item {i}",
                quantity=1,
                unit_price=float(i + 1),
                total_price=float(i + 1),
                category_id=category.id,
            )
            db_session.add(li)

        await db_session.flush()

    await db_session.commit()

    # Benchmark
    start = time.monotonic()
    response = await client.get("/api/receipts?page=1&per_page=20")
    elapsed = time.monotonic() - start

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1000
    assert len(data["items"]) == 20
    assert elapsed < 1.0, f"Receipt history took {elapsed:.2f}s, target is <1s"
