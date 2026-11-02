"""Analytics events are stored (12-analytics.md), with device type and app version.

These tests swap the writer for one bound to the test session, so the rows a
request wrote can be read back.
"""

import io
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AnalyticsEvent

APP_HEADERS = {"X-App-Version": "1.0.3", "X-Device-Type": "iPhone16,2"}


class SessionWriter:
    """Writes into the test session, so the test can read the rows back."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def write(self, events: list[AnalyticsEvent]) -> None:
        self.db.add_all(events)
        await self.db.flush()


@pytest.fixture
def stored(client, db_session):
    """Store analytics rows in the test session; return a reader for them."""
    from app.services.analytics_service import get_analytics_writer
    from main import app

    app.dependency_overrides[get_analytics_writer] = lambda: SessionWriter(db_session)

    async def rows(event_name: str | None = None) -> list[AnalyticsEvent]:
        query = select(AnalyticsEvent).order_by(AnalyticsEvent.created_at)
        if event_name:
            query = query.where(AnalyticsEvent.event_name == event_name)
        return list((await db_session.execute(query)).scalars())

    return rows


async def _scan(client: AsyncClient, image_bytes: bytes, headers=APP_HEADERS):
    return await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
        headers=headers,
    )


# --- Common properties: user, time, device type, app version ---


async def test_events_are_stored_with_device_type_and_app_version(
    client, stored, test_image_bytes
):
    from tests.conftest import DEV_USER_ID

    assert (await _scan(client, test_image_bytes)).status_code == 200

    [started] = await stored("receipt_scan_started")
    assert started.user_id == DEV_USER_ID
    assert started.device_type == "iPhone16,2"
    assert started.app_version == "1.0.3"
    assert started.created_at is not None
    assert started.properties == {"source": "camera"}


async def test_events_without_app_headers_store_nulls(client, stored, test_image_bytes):
    assert (await _scan(client, test_image_bytes, headers={})).status_code == 200

    [started] = await stored("receipt_scan_started")
    assert started.device_type is None
    assert started.app_version is None


async def test_long_header_values_are_cut_to_the_column_size(
    client, stored, test_image_bytes
):
    headers = {"X-App-Version": "9" * 100, "X-Device-Type": "d" * 100}

    assert (await _scan(client, test_image_bytes, headers=headers)).status_code == 200

    [started] = await stored("receipt_scan_started")
    assert started.app_version == "9" * 32
    assert started.device_type == "d" * 64


async def test_a_failed_scan_still_records_that_it_started(
    client, stored, test_image_bytes, mock_extractor
):
    """The funnel needs every start: a rejected scan is still one."""
    from app.llm.schemas import ReceiptExtractionResult

    mock_extractor._result = ReceiptExtractionResult(
        store_name="S", date="2026-03-15", items=[], confidence=0.9
    )

    assert (await _scan(client, test_image_bytes)).status_code == 422

    assert len(await stored("receipt_scan_started")) == 1


async def test_a_failing_analytics_write_does_not_fail_the_request(
    client, test_image_bytes, caplog
):
    from app.services.analytics_service import get_analytics_writer
    from main import app

    class BrokenWriter:
        async def write(self, events) -> None:
            raise OSError("database down")

    app.dependency_overrides[get_analytics_writer] = lambda: BrokenWriter()

    response = await _scan(client, test_image_bytes)

    assert response.status_code == 200
    assert "Analytics events not saved" in caplog.text


# --- receipt_extraction_completed (was untested) ---


async def test_extraction_completed_records_duration_items_and_confidence(
    client, stored, test_image_bytes
):
    assert (await _scan(client, test_image_bytes)).status_code == 200

    [completed] = await stored("receipt_extraction_completed")
    assert completed.properties["item_count"] == 3
    assert completed.properties["confidence_avg"] == 0.91
    assert completed.properties["duration_ms"] >= 0


# --- receipt_confirmed for manual receipts ---


async def test_a_manual_receipt_records_receipt_confirmed(client, stored):
    response = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": "2026-03-20",
            "total": 4.5,
            "items": [{"name": "Bread", "unit_price": 4.5, "total_price": 4.5}],
        },
    )
    assert response.status_code == 201

    [confirmed] = await stored("receipt_confirmed")
    assert confirmed.properties == {
        "item_count": 1,
        "correction_count": 0,
        "source": "manual",
    }


async def test_a_confirmed_scan_records_its_source(client, stored, test_image_bytes):
    scan = await _scan(client, test_image_bytes)
    receipt_id = scan.json()["receipt_id"]

    await client.patch(f"/api/receipts/{receipt_id}", json={"status": "confirmed"})

    [confirmed] = await stored("receipt_confirmed")
    assert confirmed.properties["source"] == "scan"


# --- budget_alert_triggered: category, not the budget id (was untested) ---


async def _budget(client: AsyncClient, amount: float, category_id: str | None):
    body = {"amount": amount, "period_start": "2026-03-01"}
    if category_id:
        body["category_id"] = category_id
    response = await client.post("/api/budgets", json=body)
    assert response.status_code in (200, 201), response.text
    return response.json()


async def _confirm_mock_scan(client: AsyncClient, image_bytes: bytes) -> None:
    scan = await _scan(client, image_bytes)
    await client.patch(
        f"/api/receipts/{scan.json()['receipt_id']}", json={"status": "confirmed"}
    )


async def test_alert_on_a_category_budget_records_the_category(
    client, stored, db_session, test_image_bytes, monkeypatch
):
    from app.core import clock
    from app.core.seed import seed_default_categories
    from app.models.database import Category

    monkeypatch.setattr(clock, "today", lambda: date(2026, 3, 20))
    await seed_default_categories(db_session)
    groceries = (
        await db_session.execute(select(Category).where(Category.name == "Groceries"))
    ).scalar_one()
    budget = await _budget(client, 5.0, str(groceries.id))

    await _confirm_mock_scan(client, test_image_bytes)

    alerts = await stored("budget_alert_triggered")
    assert alerts, "the mock scan's groceries should cross the budget"
    assert {a.properties["category"] for a in alerts} == {str(groceries.id)}
    assert all(a.properties["category"] != budget["id"] for a in alerts)


async def test_alert_on_the_overall_budget_records_overall(
    client, stored, test_image_bytes, monkeypatch
):
    from app.core import clock

    monkeypatch.setattr(clock, "today", lambda: date(2026, 3, 20))
    await _budget(client, 10.0, None)

    await _confirm_mock_scan(client, test_image_bytes)

    alerts = await stored("budget_alert_triggered")
    assert alerts
    assert {a.properties["category"] for a in alerts} == {"overall"}


# --- Client events carry the same common properties ---


async def test_client_events_store_device_type_and_app_version(client, stored):
    response = await client.post(
        "/api/analytics/events",
        json={"event_name": "receipt_abandoned", "properties": {"stage": "review"}},
        headers=APP_HEADERS,
    )
    assert response.status_code == 204

    [abandoned] = await stored("receipt_abandoned")
    assert abandoned.properties == {"stage": "review"}
    assert abandoned.device_type == "iPhone16,2"
    assert abandoned.app_version == "1.0.3"
