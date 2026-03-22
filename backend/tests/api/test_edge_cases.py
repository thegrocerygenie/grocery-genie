"""Edge case tests from docs/prd/11-edge-cases.md."""

import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Budget, Category, LineItem, Receipt
from tests.conftest import DEV_USER_ID


@pytest.fixture
async def category(db_session: AsyncSession):
    cat = Category(id=uuid.uuid4(), name="Groceries", is_default=True, sort_order=0)
    db_session.add(cat)
    await db_session.flush()
    return cat


# --- Duplicate Receipt Detection ---


@pytest.mark.asyncio
async def test_duplicate_receipt_warns(
    client: AsyncClient, test_image_bytes: bytes, db_session: AsyncSession, category
):
    """Second scan of same receipt within 24h returns duplicate_warning=True."""
    # First scan
    resp1 = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", test_image_bytes, "image/jpeg")},
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["duplicate_warning"] is False

    # Second scan (same mock extractor returns same data)
    resp2 = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", test_image_bytes, "image/jpeg")},
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["duplicate_warning"] is True


# --- Receipts Spanning Budget Periods ---


@pytest.mark.asyncio
async def test_receipt_date_determines_budget_period(
    client: AsyncClient, db_session: AsyncSession, category
):
    """Receipt dated Jan 31, scanned Feb 2, counts toward January budget."""
    # Create January and February budgets
    await client.post(
        "/api/budgets",
        json={"amount": 500.0, "period_start": "2026-01-01"},
    )
    await client.post(
        "/api/budgets",
        json={"amount": 500.0, "period_start": "2026-02-01"},
    )

    # Create a receipt dated Jan 31 (simulating it being scanned later)
    receipt = Receipt(
        user_id=DEV_USER_ID,
        date=date(2026, 1, 31),
        status="confirmed",
        currency="USD",
        total=100.0,
    )
    db_session.add(receipt)
    await db_session.flush()

    item = LineItem(
        receipt_id=receipt.id,
        raw_name="Bananas",
        quantity=1,
        unit_price=100.0,
        total_price=100.0,
        category_id=category.id,
    )
    db_session.add(item)
    await db_session.flush()

    # January summary should include the spending
    resp_jan = await client.get("/api/budgets/summary?period=2026-01")
    assert resp_jan.status_code == 200
    assert resp_jan.json()["overall"]["spent"] == 100.0

    # February summary should NOT include it
    resp_feb = await client.get("/api/budgets/summary?period=2026-02")
    assert resp_feb.status_code == 200
    assert resp_feb.json()["overall"]["spent"] == 0.0


# --- Zero-Budget Category ---


@pytest.mark.asyncio
async def test_zero_budget_alerts_on_any_spend(
    client: AsyncClient, db_session: AsyncSession, category
):
    """$0 budget triggers alert on any spend."""
    # Create $0 budget for category
    await client.post(
        "/api/budgets",
        json={
            "category_id": str(category.id),
            "amount": 0.0,
            "period_start": "2026-03-01",
        },
    )

    # Create confirmed receipt with spending
    receipt = Receipt(
        user_id=DEV_USER_ID,
        date=date(2026, 3, 15),
        status="pending_review",
        currency="USD",
        total=5.0,
    )
    db_session.add(receipt)
    await db_session.flush()

    item = LineItem(
        receipt_id=receipt.id,
        raw_name="Gum",
        quantity=1,
        unit_price=5.0,
        total_price=5.0,
        category_id=category.id,
    )
    db_session.add(item)
    await db_session.flush()

    # Confirm the receipt — this should trigger threshold check
    resp = await client.patch(
        f"/api/receipts/{receipt.id}",
        json={"status": "confirmed"},
    )
    assert resp.status_code == 200

    # Check that a notification was created for the $0 budget breach
    notif_resp = await client.get("/api/notifications")
    notifications = notif_resp.json()["items"]
    threshold_notifs = [n for n in notifications if n["type"] == "budget_threshold"]
    assert len(threshold_notifs) >= 1


@pytest.mark.asyncio
async def test_zero_budget_no_alert_without_spend(
    client: AsyncClient, db_session: AsyncSession, category
):
    """$0 budget with no spend produces no alert."""
    from app.services.budget_service import BudgetService

    budget = Budget(
        user_id=DEV_USER_ID,
        category_id=category.id,
        amount=0.0,
        period_start=date(2026, 3, 1),
    )
    db_session.add(budget)
    await db_session.flush()

    service = BudgetService(db_session)
    breaches = await service.check_thresholds(DEV_USER_ID, date(2026, 3, 15))
    assert len(breaches) == 0


# --- Mid-Month Budget Change ---


@pytest.mark.asyncio
async def test_mid_month_budget_change(
    client: AsyncClient, db_session: AsyncSession, category
):
    """Changing budget mid-period applies to remaining period."""
    # Create $500 budget
    resp = await client.post(
        "/api/budgets",
        json={"amount": 500.0, "period_start": "2026-03-01"},
    )
    budget_id = resp.json()["id"]

    # Add $200 spending
    receipt = Receipt(
        user_id=DEV_USER_ID,
        date=date(2026, 3, 10),
        status="confirmed",
        currency="USD",
        total=200.0,
    )
    db_session.add(receipt)
    await db_session.flush()
    item = LineItem(
        receipt_id=receipt.id,
        raw_name="Groceries",
        quantity=1,
        unit_price=200.0,
        total_price=200.0,
    )
    db_session.add(item)
    await db_session.flush()

    # Update budget to $300 mid-month
    await client.patch(f"/api/budgets/{budget_id}", json={"amount": 300.0})

    # Summary should show: spent=200, budget=300, remaining=100
    summary = await client.get("/api/budgets/summary?period=2026-03")
    data = summary.json()
    assert data["overall"]["budget"] == 300.0
    assert data["overall"]["spent"] == 200.0
    assert data["overall"]["remaining"] == 100.0


# --- Long Receipts (50+ items) ---


@pytest.mark.asyncio
async def test_long_receipt_50_items(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_extractor,
    test_image_bytes: bytes,
):
    """Pipeline handles 50+ line items without issues."""
    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    # Configure mock extractor to return 50 items
    mock_extractor._result = ReceiptExtractionResult(
        store_name="Costco",
        date="2026-03-15",
        currency="USD",
        items=[
            ExtractedLineItem(
                name=f"Item {i}",
                quantity=1,
                unit_price=float(i + 1),
                total_price=float(i + 1),
                confidence=0.95,
            )
            for i in range(50)
        ],
        subtotal=sum(float(i + 1) for i in range(50)),
        total=sum(float(i + 1) for i in range(50)),
        confidence=0.90,
    )

    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", test_image_bytes, "image/jpeg")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["extraction"]["items"]) == 50

    # Verify GET also returns all 50
    receipt_id = data["receipt_id"]
    detail = await client.get(f"/api/receipts/{receipt_id}")
    assert detail.status_code == 200
    assert len(detail.json()["items"]) == 50
