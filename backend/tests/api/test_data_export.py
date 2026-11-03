"""NFR Privacy 2 (V1.1, Premium per D2): export receipts, line items, budgets
and prices as JSON or CSV.

GET /api/users/me/export?format=json|csv. The signed-in user's own data only;
deleted receipts and budgets are left out.
"""

import csv
import io
import uuid
import zipfile
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.database import (
    Budget,
    CanonicalItem,
    LineItem,
    PriceObservation,
    Receipt,
    Store,
    User,
)
from tests.api.test_analytics import SpyBackend
from tests.api.test_items import _scan_and_confirm
from tests.conftest import USER_B_ID, _create_test_client, consented, ensure_user

CSV_FILES = {"receipts.csv", "line_items.csv", "budgets.csv", "price_observations.csv"}


async def _client_for(db_session, mock_extractor, *, premium: bool) -> User:
    user = User(
        email=f"export-{uuid.uuid4().hex[:8]}@test.com",
        name="Exporter",
        premium_active=premium,
        **consented(),
    )
    db_session.add(user)
    await db_session.flush()
    from main import app

    _create_test_client(app, db_session, mock_extractor, user)
    return user


@pytest.fixture
async def premium_client(
    db_session, mock_extractor
) -> AsyncGenerator[AsyncClient, None]:
    from app.core.seed import seed_default_categories
    from main import app

    await seed_default_categories(db_session)

    await _client_for(db_session, mock_extractor, premium=True)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def free_client(db_session, mock_extractor) -> AsyncGenerator[AsyncClient, None]:
    from main import app

    await _client_for(db_session, mock_extractor, premium=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def other_users_data(db_session) -> None:
    """User B's receipt, line item, budget and price, stored directly."""
    await ensure_user(db_session, USER_B_ID)
    store = Store(name="B Mart", normalized_name="b mart")
    db_session.add(store)
    await db_session.flush()
    receipt = Receipt(
        user_id=USER_B_ID,
        store_id=store.id,
        date=date(2026, 3, 9),
        status="confirmed",
        currency="USD",
        total=4.25,
    )
    item = CanonicalItem(user_id=USER_B_ID, canonical_name="B Secret Cheese")
    db_session.add_all([receipt, item])
    await db_session.flush()
    line = LineItem(
        receipt_id=receipt.id,
        raw_name="B SECRET CHEESE",
        quantity=1,
        unit_price=4.25,
        total_price=4.25,
        position=0,
        canonical_item_id=item.id,
    )
    db_session.add(line)
    await db_session.flush()
    db_session.add_all(
        [
            PriceObservation(
                user_id=USER_B_ID,
                canonical_item_id=item.id,
                receipt_id=receipt.id,
                line_item_id=line.id,
                store_id=store.id,
                date=receipt.date,
                unit_price=4.25,
                quantity=1,
                currency="USD",
            ),
            Budget(
                user_id=USER_B_ID,
                amount=987.65,
                period_type="monthly",
                period_start=date(2026, 3, 1),
            ),
        ]
    )
    await db_session.flush()


async def _seed(client: AsyncClient, mock_extractor, image: bytes) -> dict:
    """A confirmed scan with two lines, a deleted receipt and an overall budget."""
    kept = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "FreshCo",
        "2026-03-01",
        ("ORG BANANAS", 2.0, 0.69, "lb"),
        ("=HYPERLINK(evil)", 1.0, 3.5),
    )
    gone = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "Loblaws",
        "2026-03-05",
        ("DELETED ONLY ITEM", 1.0, 9.99),
    )
    resp = await client.delete(f"/api/receipts/{gone['id']}")
    assert resp.status_code == 204, resp.text
    budget = await client.post(
        "/api/budgets",
        json={
            "category_id": None,
            "amount": 450.0,
            "period_type": "monthly",
            "period_start": "2026-03-01",
        },
    )
    assert budget.status_code == 201, budget.text
    return {"kept": kept, "gone": gone, "budget": budget.json()}


# --- Gate (D2) ---------------------------------------------------------------


@pytest.mark.parametrize("fmt", ["json", "csv"])
async def test_export_needs_premium(free_client: AsyncClient, fmt):
    resp = await free_client.get("/api/users/me/export", params={"format": fmt})

    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["code"] == "premium_required"
    assert detail["feature"] == "data_export"


async def test_export_rejects_unknown_format(premium_client: AsyncClient):
    resp = await premium_client.get("/api/users/me/export", params={"format": "xml"})

    assert resp.status_code == 422


async def test_export_needs_sign_in():
    from main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.get("/api/users/me/export")

    assert resp.status_code == 401


# --- JSON --------------------------------------------------------------------


async def test_json_export_has_receipts_line_items_budgets_and_prices(
    premium_client, mock_extractor, test_image_bytes, other_users_data
):
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get("/api/users/me/export", params={"format": "json"})

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/json")
    disposition = resp.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert ".json" in disposition
    body = resp.json()
    assert body["format_version"] == 1
    assert body["exported_at"]
    assert body["currency"] == "USD"

    [receipt] = body["receipts"]
    assert receipt["id"] == seeded["kept"]["id"]
    assert receipt["store_name"] == "FreshCo"
    assert receipt["date"] == "2026-03-01"
    assert receipt["status"] == "confirmed"
    assert receipt["total"] == 4.88
    assert receipt["currency"] == "USD"
    names = [li["name"] for li in receipt["line_items"]]
    assert names == ["ORG BANANAS", "=HYPERLINK(evil)"]  # JSON is not escaped
    banana = receipt["line_items"][0]
    assert banana["quantity"] == 2.0
    assert banana["unit_price"] == 0.69
    assert banana["total_price"] == 1.38
    assert banana["unit_of_measure"] == "lb"
    assert banana["category"] == "Groceries"
    assert banana["canonical_item_id"]

    [budget] = body["budgets"]
    assert budget["id"] == seeded["budget"]["id"]
    assert budget["amount"] == 450.0
    assert budget["category"] is None
    assert budget["period_start"] == "2026-03-01"
    assert budget["period_type"] == "monthly"
    assert budget["currency"] == "USD"

    prices = body["price_observations"]
    assert {(p["item_name"], p["unit_price"], p["store_name"]) for p in prices} == {
        ("ORG BANANAS", 0.69, "FreshCo"),
        ("=HYPERLINK(evil)", 3.5, "FreshCo"),
    }
    assert all(p["receipt_id"] == seeded["kept"]["id"] for p in prices)
    assert all(p["date"] == "2026-03-01" for p in prices)

    text = resp.text
    assert "DELETED ONLY ITEM" not in text  # a deleted receipt stays out
    assert "B Secret Cheese" not in text  # another user's data stays out
    assert "B SECRET CHEESE" not in text
    assert "987.65" not in text


async def test_json_export_of_an_empty_account(premium_client):
    resp = await premium_client.get("/api/users/me/export")  # json by default

    assert resp.status_code == 200
    body = resp.json()
    assert body["receipts"] == []
    assert body["budgets"] == []
    assert body["price_observations"] == []


# --- CSV ---------------------------------------------------------------------


def _csv_rows(archive: zipfile.ZipFile, name: str) -> list[dict]:
    text = archive.read(name).decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


async def test_csv_export_is_a_zip_of_one_file_per_entity(
    premium_client, mock_extractor, test_image_bytes, other_users_data
):
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get("/api/users/me/export", params={"format": "csv"})

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"
    assert ".zip" in resp.headers["content-disposition"]
    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    assert set(archive.namelist()) == CSV_FILES

    [receipt] = _csv_rows(archive, "receipts.csv")
    assert receipt["id"] == seeded["kept"]["id"]
    assert receipt["store_name"] == "FreshCo"
    assert receipt["total"] == "4.88"

    lines = _csv_rows(archive, "line_items.csv")
    assert [li["receipt_id"] for li in lines] == [seeded["kept"]["id"]] * 2
    assert [li["name"] for li in lines] == ["ORG BANANAS", "'=HYPERLINK(evil)"]
    assert lines[0]["unit_price"] == "0.69"
    assert lines[0]["quantity"] == "2.000"

    [budget] = _csv_rows(archive, "budgets.csv")
    assert budget["amount"] == "450.00"
    assert budget["category"] == ""

    prices = _csv_rows(archive, "price_observations.csv")
    assert sorted(p["item_name"] for p in prices) == [
        "'=HYPERLINK(evil)",
        "ORG BANANAS",
    ]

    everything = b"".join(archive.read(n) for n in archive.namelist())
    assert b"DELETED ONLY ITEM" not in everything
    assert b"B SECRET CHEESE" not in everything
    assert b"B Secret Cheese" not in everything
    assert b"987.65" not in everything


async def test_csv_export_of_an_empty_account_has_headers(premium_client):
    resp = await premium_client.get("/api/users/me/export", params={"format": "csv"})

    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    for name in CSV_FILES:
        header = archive.read(name).decode("utf-8-sig").splitlines()
        assert len(header) == 1 and header[0].startswith("id,")


# --- CSV formula injection ---------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("=1+2", "'=1+2"),
        ("+SUM(A1)", "'+SUM(A1)"),
        ("-2+3", "'-2+3"),
        ("@cmd", "'@cmd"),
        ("\tTAB", "'\tTAB"),
        ("\rCR", "'\rCR"),
        ("Milk", "Milk"),
        ("", ""),
        (None, ""),
    ],
)
def test_csv_text_cells_are_escaped(value, expected):
    from app.services.export_service import csv_text

    assert csv_text(value) == expected


# --- Large accounts and analytics -------------------------------------------


async def test_export_reads_in_batches(
    premium_client, db_session, monkeypatch, mock_extractor, test_image_bytes
):
    """More receipts than one batch, and a file past the in-memory limit (it
    rolls to disk): every receipt is exported once, in order."""
    from app.services import export_service

    monkeypatch.setattr(export_service, "BATCH_SIZE", 2)
    monkeypatch.setattr(export_service, "SPOOL_MAX_BYTES", 256)
    me = (await premium_client.get("/api/users/me")).json()
    user_id = uuid.UUID(me["id"])
    for day in range(1, 6):
        receipt = Receipt(
            user_id=user_id,
            date=date(2026, 3, day),
            status="confirmed",
            currency="USD",
            total=day,
            created_at=datetime(2026, 3, day, tzinfo=UTC),
        )
        db_session.add(receipt)
        await db_session.flush()
        db_session.add(
            LineItem(
                receipt_id=receipt.id,
                raw_name=f"Item {day}",
                quantity=1,
                unit_price=day,
                total_price=day,
                position=0,
            )
        )
    await db_session.flush()

    body = (await premium_client.get("/api/users/me/export")).json()
    csv_resp = await premium_client.get("/api/users/me/export?format=csv")
    lines = _csv_rows(zipfile.ZipFile(io.BytesIO(csv_resp.content)), "line_items.csv")

    assert [r["date"] for r in body["receipts"]] == [
        f"2026-03-0{d}" for d in range(1, 6)
    ]
    assert [r["line_items"][0]["name"] for r in body["receipts"]] == [
        f"Item {d}" for d in range(1, 6)
    ]
    assert [li["name"] for li in lines] == [f"Item {d}" for d in range(1, 6)]


async def test_export_records_data_exported_event(
    premium_client, mock_extractor, test_image_bytes
):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    await _seed(premium_client, mock_extractor, test_image_bytes)
    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )

    await premium_client.get("/api/users/me/export", params={"format": "csv"})

    [(name, props, _user)] = [c for c in spy.calls if c[0] == "data_exported"]
    assert props == {
        "format": "csv",
        "receipt_count": 1,
        "line_item_count": 2,
        "budget_count": 1,
        "price_observation_count": 2,
    }


async def test_free_user_refused_export_records_no_event(free_client):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )

    await free_client.get("/api/users/me/export")

    assert spy.calls == []
