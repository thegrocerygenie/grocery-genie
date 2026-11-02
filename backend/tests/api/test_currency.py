"""Receipt currency vs the user's budget currency (11-edge-cases: currency
mismatch). MVP rule, decided 2026-11-02: a receipt in another currency is
shown in its own currency and left out of budget spend."""

import io
import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult
from app.models.database import Receipt

TODAY = date(2026, 3, 20)


@pytest.fixture(autouse=True)
def pinned_today(monkeypatch):
    from app.core import clock

    monkeypatch.setattr(clock, "today", lambda: TODAY)


@pytest.fixture
async def client(db_session, mock_extractor):
    """A signed-in user stored in the database, as in production: the spend
    queries read the user's currency from its row."""
    from httpx import ASGITransport

    from app.models.database import User
    from main import app
    from tests.conftest import _create_test_client, consented

    user = User(
        email="currency@test.com",
        name="Currency",
        notif_threshold_50=True,
        notif_threshold_80=True,
        notif_threshold_100=True,
        **consented(),
    )
    db_session.add(user)
    await db_session.flush()
    _create_test_client(app, db_session, mock_extractor, user)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


def _extraction(currency: str | None, total: float = 10.0) -> ReceiptExtractionResult:
    return ReceiptExtractionResult(
        store_name="Shop",
        date="2026-03-15",
        currency=currency,
        items=[
            ExtractedLineItem(
                name="Cheese",
                quantity=1,
                unit_price=total,
                total_price=total,
                confidence=0.9,
            )
        ],
        subtotal=total,
        total=total,
        confidence=0.9,
    )


async def _scan(client: AsyncClient, image_bytes: bytes) -> dict:
    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _scan_and_confirm(client, image_bytes, mock_extractor, currency, total=10.0):
    mock_extractor._result = _extraction(currency, total)
    scan = await _scan(client, image_bytes)
    mock_extractor._result = None
    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}", json={"status": "confirmed"}
    )
    assert resp.status_code == 200, resp.text
    return scan


async def _set_currency(client: AsyncClient, code: str) -> None:
    resp = await client.patch("/api/users/me", json={"currency_preference": code})
    assert resp.status_code == 200, resp.text


async def _spent(client: AsyncClient) -> float:
    resp = await client.get("/api/budgets/summary", params={"period": "2026-03"})
    assert resp.status_code == 200, resp.text
    return resp.json()["overall"]["spent"]


async def _budget(client: AsyncClient, amount: float = 100.0) -> None:
    resp = await client.post(
        "/api/budgets", json={"amount": amount, "period_start": "2026-03-01"}
    )
    assert resp.status_code in (200, 201), resp.text


# --- What currency a scanned receipt gets ---


async def test_a_receipt_with_no_currency_takes_the_users(
    client, test_image_bytes, mock_extractor
):
    await _set_currency(client, "EUR")
    mock_extractor._result = _extraction(None)

    scan = await _scan(client, test_image_bytes)

    assert scan["extraction"]["currency"] == "EUR"


async def test_a_currency_symbol_becomes_its_code(
    client, test_image_bytes, mock_extractor
):
    mock_extractor._result = _extraction("€")

    scan = await _scan(client, test_image_bytes)

    assert scan["extraction"]["currency"] == "EUR"


async def test_an_unrecognized_currency_takes_the_users_with_a_warning(
    client, test_image_bytes, mock_extractor
):
    mock_extractor._result = _extraction("$")

    scan = await _scan(client, test_image_bytes)

    assert scan["extraction"]["currency"] == "USD"
    assert any("currency" in w for w in scan["extraction"]["warnings"])


async def test_a_manual_receipt_defaults_to_the_users_currency(client):
    await _set_currency(client, "GBP")

    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner",
            "date": "2026-03-15",
            "total": 2.0,
            "items": [{"name": "Bread", "unit_price": 2.0, "total_price": 2.0}],
        },
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["currency"] == "GBP"


# --- Budget spend counts only the user's currency ---


async def test_a_receipt_in_another_currency_is_left_out_of_spend(
    client, test_image_bytes, mock_extractor
):
    await _budget(client)
    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "USD", 10.0)
    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "EUR", 40.0)

    assert await _spent(client) == 10.0


async def test_changing_the_users_currency_changes_what_counts(
    client, test_image_bytes, mock_extractor
):
    await _budget(client)
    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "USD", 10.0)
    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "EUR", 40.0)

    await _set_currency(client, "EUR")

    assert await _spent(client) == 40.0


async def test_a_receipt_in_another_currency_sends_no_budget_alert(
    client, test_image_bytes, mock_extractor
):
    await _budget(client, amount=10.0)

    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "EUR", 40.0)

    notes = (await client.get("/api/notifications")).json()["items"]
    assert [n for n in notes if n["type"] == "budget_threshold"] == []


async def test_top_items_leave_out_other_currencies(
    client, test_image_bytes, mock_extractor
):
    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "EUR", 40.0)

    resp = await client.get("/api/dashboard/spending", params={"period": "2026-03"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["top_items"] == []


# --- The user's currency ---


async def test_the_users_currency_is_stored_as_an_upper_case_code(client):
    await _set_currency(client, "eur")

    me = (await client.get("/api/users/me")).json()
    assert me["currency_preference"] == "EUR"


@pytest.mark.parametrize("bad", ["EURO", "€", "12", ""])
async def test_a_currency_that_is_not_a_code_is_rejected(client, bad):
    resp = await client.patch("/api/users/me", json={"currency_preference": bad})

    assert resp.status_code == 422


# --- Money text the server writes ---


async def test_an_alert_names_the_users_currency(
    client, test_image_bytes, mock_extractor
):
    await _set_currency(client, "EUR")
    await _budget(client, amount=10.0)

    await _scan_and_confirm(client, test_image_bytes, mock_extractor, "EUR", 15.0)

    notes = (await client.get("/api/notifications")).json()["items"]
    bodies = [n["body"] for n in notes if n["type"] == "budget_threshold"]
    assert any("€5.00" in body for body in bodies), bodies
    assert not any("$" in body for body in bodies)


async def test_a_deleted_receipt_is_labelled_in_its_currency(
    client, test_image_bytes, mock_extractor, db_session
):
    scan = await _scan_and_confirm(
        client, test_image_bytes, mock_extractor, "GBP", 12.5
    )
    await client.delete(f"/api/receipts/{scan['receipt_id']}")

    resp = await client.get("/api/receipts/recently-deleted")

    assert resp.status_code == 200, resp.text
    [item] = resp.json()
    assert "£12.50" in item["label"]
    stored = (
        await db_session.execute(
            select(Receipt.currency).where(Receipt.id == uuid.UUID(scan["receipt_id"]))
        )
    ).scalar_one()
    assert stored == "GBP"
