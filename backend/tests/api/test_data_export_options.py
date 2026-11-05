"""PREM-04 (V1.1, DA-8, decision D10): data export options.

GET /api/users/me/export?format=json|csv|pdf&from=&to=&include=... and
GET /api/users/me/export/summary?from=&to=. A date range (receipts dated in
it, their line items and the prices they recorded), the sections to include,
receipt images as a zip with ``images/``, and a PDF spend report. Both routes
are Premium and read only the caller's own rows (edge case ``EC-PREM | 4``).
"""

import csv
import io
import uuid
import zipfile
from collections.abc import AsyncGenerator
from datetime import date

import pypdfium2 as pdfium
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.image.storage import LocalFileStorage, generate_receipt_path
from app.models.database import (
    Budget,
    CanonicalItem,
    Category,
    LineItem,
    PriceObservation,
    Receipt,
    Store,
    User,
)
from tests.api.test_analytics import SpyBackend
from tests.api.test_items import _scan, _scan_and_confirm
from tests.conftest import USER_B_ID, _create_test_client, consented, ensure_user

EXPORT = "/api/users/me/export"
SUMMARY = "/api/users/me/export/summary"
# Dec 2025 to Sep 2026: holds the March receipt, not October 2025's or 2026's.
RANGE = {"from": "2025-12-01", "to": "2026-09-30"}
ALL = "receipts,prices,budgets,images"


async def _client_for(db_session, mock_extractor, *, premium: bool) -> User:
    user = User(
        email=f"export-opt-{uuid.uuid4().hex[:8]}@test.com",
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
async def other_user(db_session) -> AsyncGenerator[uuid.UUID, None]:
    """User B: a scanned receipt in the range with an image on disk, a line,
    a price, a budget and a custom category, stored directly."""
    await ensure_user(db_session, USER_B_ID)
    store = Store(name="B Mart", normalized_name="b mart")
    category = Category(name="B Secret Category", user_id=USER_B_ID)
    db_session.add_all([store, category])
    await db_session.flush()
    receipt = Receipt(
        user_id=USER_B_ID,
        store_id=store.id,
        store_name="B Mart",
        date=date(2026, 3, 9),
        status="confirmed",
        currency="USD",
        total=4.25,
    )
    item = CanonicalItem(user_id=USER_B_ID, canonical_name="B Secret Cheese")
    db_session.add_all([receipt, item])
    await db_session.flush()
    receipt.image_url = f"/api/receipts/{receipt.id}/image"
    line = LineItem(
        receipt_id=receipt.id,
        raw_name="B SECRET CHEESE",
        quantity=1,
        unit_price=4.25,
        total_price=4.25,
        position=0,
        canonical_item_id=item.id,
        category_id=category.id,
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
    storage = LocalFileStorage(get_settings().storage_path)
    path = generate_receipt_path(receipt.id)
    await storage.save(b"B-IMAGE-BYTES", path)
    yield receipt.id
    await storage.delete(path)


async def _seed(client: AsyncClient, mock_extractor, image: bytes) -> dict:
    """Scans in Oct 2025, Mar 2026 (two lines) and Oct 2026; a manual receipt
    in Apr 2026; a deleted scan in May 2026; an overall budget and a custom
    category."""
    old = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "OldMart",
        "2025-10-15",
        ("OLD BREAD", 1.0, 2.0),
    )
    march = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "FreshCo",
        "2026-03-01",
        ("ORG BANANAS", 2.0, 0.69, "lb"),
        ("OAT MILK", 1.0, 3.5),
    )
    late = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "LateMart",
        "2026-10-20",
        ("LATE APPLES", 1.0, 4.0),
    )
    manual = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": "2026-04-02",
            "total": 6.0,
            "items": [
                {
                    "name": "HAND EGGS",
                    "quantity": 1,
                    "unit_price": 6.0,
                    "total_price": 6.0,
                }
            ],
        },
    )
    assert manual.status_code == 201, manual.text
    gone = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "Loblaws",
        "2026-05-05",
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
    category = await client.post("/api/categories", json={"name": "Pet food"})
    assert category.status_code == 201, category.text
    return {
        "old": old,
        "march": march,
        "late": late,
        "manual": manual.json(),
        "gone": gone,
        "budget": budget.json(),
        "category": category.json(),
    }


def _csv_rows(archive: zipfile.ZipFile, name: str) -> list[dict]:
    text = archive.read(name).decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def _pdf_text(data: bytes) -> str:
    doc = pdfium.PdfDocument(data)
    try:
        return "\n".join(
            doc[i].get_textpage().get_text_range() for i in range(len(doc))
        )
    finally:
        doc.close()


# --- AC 1: the range ----------------------------------------------------------


async def test_export_holds_only_receipts_dated_in_the_range(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 1: receipts dated in the range, their lines and their prices."""
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    body = (await premium_client.get(EXPORT, params={"format": "json", **RANGE})).json()

    assert [r["id"] for r in body["receipts"]] == [
        seeded["march"]["id"],
        seeded["manual"]["id"],
    ]
    names = {li["name"] for r in body["receipts"] for li in r["line_items"]}
    assert names == {"ORG BANANAS", "OAT MILK", "HAND EGGS"}
    prices = {p["item_name"] for p in body["price_observations"]}
    assert "OLD BREAD" not in prices and "LATE APPLES" not in prices
    assert {"ORG BANANAS", "OAT MILK"} <= prices
    assert body["range"] == {"from": "2025-12-01", "to": "2026-09-30"}


async def test_range_bounds_are_inclusive_and_open_ended(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 1: From and To days are in the range; either can be left out."""
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    exact = (
        await premium_client.get(
            EXPORT, params={"from": "2026-03-01", "to": "2026-03-01"}
        )
    ).json()
    since = (await premium_client.get(EXPORT, params={"from": "2026-04-02"})).json()
    until = (await premium_client.get(EXPORT, params={"to": "2025-10-15"})).json()

    assert [r["id"] for r in exact["receipts"]] == [seeded["march"]["id"]]
    assert [r["id"] for r in since["receipts"]] == [
        seeded["manual"]["id"],
        seeded["late"]["id"],
    ]
    assert [r["id"] for r in until["receipts"]] == [seeded["old"]["id"]]
    assert since["range"] == {"from": "2026-04-02", "to": None}


async def test_csv_export_honours_the_range(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 1 and 2: CSV is still a zip of one file per entity, in range."""
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get(EXPORT, params={"format": "csv", **RANGE})

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    assert set(archive.namelist()) == {
        "receipts.csv",
        "line_items.csv",
        "budgets.csv",
        "categories.csv",
        "price_observations.csv",
    }
    receipts = _csv_rows(archive, "receipts.csv")
    assert [r["id"] for r in receipts] == [
        seeded["march"]["id"],
        seeded["manual"]["id"],
    ]
    lines = {li["name"] for li in _csv_rows(archive, "line_items.csv")}
    assert lines == {"ORG BANANAS", "OAT MILK", "HAND EGGS"}


async def test_range_reads_in_batches(
    premium_client, db_session, monkeypatch, mock_extractor, test_image_bytes
):
    """A range over more receipts than one batch keeps the keyset pages right."""
    from app.services import export_service

    monkeypatch.setattr(export_service, "BATCH_SIZE", 1)
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    body = (await premium_client.get(EXPORT, params=RANGE)).json()

    assert [r["id"] for r in body["receipts"]] == [
        seeded["march"]["id"],
        seeded["manual"]["id"],
    ]
    assert len(body["price_observations"]) == 3  # bananas, oat milk, eggs


# --- AC 3: includes -------------------------------------------------------------


async def test_includes_leave_out_the_sections_switched_off(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 3: JSON keeps only the chosen sections."""
    await _seed(premium_client, mock_extractor, test_image_bytes)

    prices_only = (
        await premium_client.get(EXPORT, params={"include": "prices"})
    ).json()
    settings_only = (
        await premium_client.get(EXPORT, params={"include": "budgets"})
    ).json()

    assert "receipts" not in prices_only and "budgets" not in prices_only
    assert "categories" not in prices_only
    assert prices_only["price_observations"]
    assert prices_only["includes"] == ["prices"]
    assert set(settings_only) >= {"budgets", "categories"}
    assert "receipts" not in settings_only
    assert "price_observations" not in settings_only


async def test_categories_and_budgets_hold_custom_categories(
    premium_client, mock_extractor, test_image_bytes, other_user
):
    """PREM-04 AC 3, 7: "Categories & budgets" exports the user's categories,
    built-in and custom, and never another user's."""
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    body = (await premium_client.get(EXPORT)).json()
    csv_resp = await premium_client.get(EXPORT, params={"format": "csv"})
    rows = _csv_rows(zipfile.ZipFile(io.BytesIO(csv_resp.content)), "categories.csv")

    custom = [c for c in body["categories"] if not c["is_default"]]
    assert [c["name"] for c in custom] == ["Pet food"]
    assert custom[0]["id"] == seeded["category"]["id"]
    assert "Groceries" in {c["name"] for c in body["categories"]}
    assert "B Secret Category" not in {r["name"] for r in rows}
    assert "Pet food" in {r["name"] for r in rows}
    # Budgets are settings, not dated: the range does not cut them.
    ranged = (await premium_client.get(EXPORT, params={"to": "2020-01-31"})).json()
    assert [b["id"] for b in ranged["budgets"]] == [seeded["budget"]["id"]]


async def test_csv_includes_only_the_chosen_files(premium_client):
    resp = await premium_client.get(
        EXPORT, params={"format": "csv", "include": "receipts"}
    )

    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    assert set(archive.namelist()) == {"receipts.csv", "line_items.csv"}


# --- AC 3, EC-PREM 4: receipt images ------------------------------------------


async def test_receipt_images_come_as_a_zip_with_an_images_folder(
    premium_client, mock_extractor, test_image_bytes, other_user
):
    """PREM-04 AC 3, EC-PREM 4: each scanned receipt's image under images/;
    a manual receipt and a purged image are left out and counted."""
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)
    storage = LocalFileStorage(get_settings().storage_path)
    # The October 2025 scan's image is gone (purged): it is left out.
    await storage.delete(generate_receipt_path(uuid.UUID(seeded["old"]["id"])))

    resp = await premium_client.get(EXPORT, params={"format": "json", "include": ALL})

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"
    assert ".zip" in resp.headers["content-disposition"]
    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    names = set(archive.namelist())
    [document] = [n for n in names if n.endswith(".json")]
    images = {n for n in names if n.startswith("images/") and n.endswith(".jpg")}
    assert images == {
        f"images/{seeded['march']['id']}.jpg",
        f"images/{seeded['late']['id']}.jpg",
    }
    assert archive.read(f"images/{seeded['march']['id']}.jpg") == test_image_bytes
    note = archive.read("images/README.txt").decode()
    assert "2 receipt images" in note
    assert "2 receipts have no image" in note  # manual, and the purged one
    body = __import__("json").loads(archive.read(document))
    assert len(body["receipts"]) == 4
    everything = b"".join(archive.read(n) for n in names)
    assert b"B-IMAGE-BYTES" not in everything
    assert str(other_user) not in "".join(names)


async def test_images_with_csv_share_the_zip(
    premium_client, mock_extractor, test_image_bytes
):
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get(
        EXPORT, params={"format": "csv", "include": "receipts,images", **RANGE}
    )

    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    assert set(archive.namelist()) == {
        "receipts.csv",
        "line_items.csv",
        f"images/{seeded['march']['id']}.jpg",
        "images/README.txt",
    }


async def test_images_off_by_default(premium_client, mock_extractor, test_image_bytes):
    """PREM-04 AC 3: Receipt images start off; JSON stays one document."""
    await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get(EXPORT)

    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json()["includes"] == ["receipts", "prices", "budgets"]


# --- AC 5: the PDF report -----------------------------------------------------


async def test_pdf_report_is_a_spend_summary_of_the_range(
    premium_client, mock_extractor, test_image_bytes, other_user
):
    """PREM-04 AC 5: monthly spend by category, top items and the receipt list."""
    await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get(EXPORT, params={"format": "pdf", **RANGE})

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert ".pdf" in resp.headers["content-disposition"]
    text = _pdf_text(resp.content)
    assert "Spend report" in text
    assert "Dec 2025 – Sep 2026" in text
    assert "Monthly spend by category" in text
    assert "March 2026" in text and "April 2026" in text
    assert "Groceries" in text
    assert "Top items" in text
    assert "OAT MILK" in text and "HAND EGGS" in text
    assert "Receipts" in text
    assert "FreshCo" in text and "Corner Shop" in text
    assert "$4.88" in text  # the March receipt's total
    # Out of range, deleted, and another user's: not in the report.
    for absent in ("OldMart", "LateMart", "Loblaws", "B Mart", "B SECRET CHEESE"):
        assert absent not in text


async def test_pdf_monthly_spend_counts_only_confirmed_receipts(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 5: spend is what the budget counts, confirmed receipts only;
    an unconfirmed scan is listed, marked, and never adds to the spend."""
    await _scan_and_confirm(
        premium_client,
        mock_extractor,
        test_image_bytes,
        "ConfirmedMart",
        "2026-03-01",
        ("KEPT ITEM", 1.0, 4.0),
    )
    await _scan(
        premium_client,
        mock_extractor,
        test_image_bytes,
        "PendingMart",
        "2026-03-02",
        ("PENDING ITEM", 1.0, 7.0),
    )

    text = _pdf_text(
        (await premium_client.get(EXPORT, params={"format": "pdf"})).content
    )

    assert "March 2026 $4.00" in text
    assert "$11.00" not in text
    assert "PENDING ITEM" not in text  # not a top item either
    assert "PendingMart (not confirmed)" in text


async def test_pdf_report_leaves_out_sections_switched_off(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 5: a section whose switch is off is not in the report."""
    await _seed(premium_client, mock_extractor, test_image_bytes)

    no_receipts = _pdf_text(
        (
            await premium_client.get(
                EXPORT, params={"format": "pdf", "include": "budgets"}
            )
        ).content
    )
    no_budgets = _pdf_text(
        (
            await premium_client.get(
                EXPORT, params={"format": "pdf", "include": "receipts"}
            )
        ).content
    )

    assert "Monthly spend by category" in no_receipts
    assert "Top items" not in no_receipts and "FreshCo" not in no_receipts
    assert "Monthly spend by category" not in no_budgets
    assert "Top items" in no_budgets and "FreshCo" in no_budgets


async def test_pdf_report_of_an_empty_range_and_names_outside_latin(
    premium_client, mock_extractor, test_image_bytes
):
    """A range with no receipts still builds; a name the PDF font cannot draw
    does not break it (JSON and CSV keep the name as it is)."""
    await _scan_and_confirm(
        premium_client,
        mock_extractor,
        test_image_bytes,
        "東京マート Łódź",
        "2026-03-01",
        ("ŻUBRÓWKA €", 1.0, 3.0),
    )

    empty = await premium_client.get(
        EXPORT, params={"format": "pdf", "from": "2020-01-01", "to": "2020-12-31"}
    )
    named = await premium_client.get(EXPORT, params={"format": "pdf"})

    assert empty.status_code == 200
    assert "No receipts in this range" in _pdf_text(empty.content)
    assert named.status_code == 200, named.text
    assert "dz" in _pdf_text(named.content)  # "Łódź", as near as the font goes


async def test_pdf_report_pages_past_one_batch(premium_client, db_session, monkeypatch):
    """Many receipts: read in batches, the list runs onto more pages."""
    from app.services import export_service

    monkeypatch.setattr(export_service, "BATCH_SIZE", 7)
    me = (await premium_client.get("/api/users/me")).json()
    user_id = uuid.UUID(me["id"])
    for n in range(80):
        db_session.add(
            Receipt(
                user_id=user_id,
                store_name=f"Shop {n:02d}",
                date=date(2026, 1 + n % 9, 1 + n % 27),
                status="confirmed",
                currency="USD",
                total=n,
            )
        )
    await db_session.flush()

    resp = await premium_client.get(EXPORT, params={"format": "pdf"})

    doc = pdfium.PdfDocument(resp.content)
    pages = len(doc)
    doc.close()
    text = _pdf_text(resp.content)
    assert pages > 1
    assert all(f"Shop {n:02d}" in text for n in range(80))


# --- AC 4, 6: the summary --------------------------------------------------------


async def test_summary_counts_the_receipts_in_the_range(
    premium_client, mock_extractor, test_image_bytes, other_user
):
    """PREM-04 AC 4, 6: the count behind "Export N receipts": the user's own,
    not deleted, dated in the range."""
    await _seed(premium_client, mock_extractor, test_image_bytes)

    ranged = await premium_client.get(SUMMARY, params=RANGE)
    everything = await premium_client.get(SUMMARY)
    empty = await premium_client.get(
        SUMMARY, params={"from": "2020-01-01", "to": "2020-12-31"}
    )

    assert ranged.status_code == 200, ranged.text
    assert ranged.json() == {"receipt_count": 2}
    assert everything.json() == {"receipt_count": 4}
    assert empty.json() == {"receipt_count": 0}


# --- AC 6: Premium, validation, analytics ----------------------------------------


@pytest.mark.parametrize(
    ("path", "params"),
    [
        (EXPORT, {"format": "pdf"}),
        (EXPORT, {"format": "json", "include": "images", **RANGE}),
        (SUMMARY, {}),
        (SUMMARY, RANGE),
    ],
)
async def test_export_options_need_premium(free_client, path, params):
    resp = await free_client.get(path, params=params)

    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "premium_required"
    assert resp.json()["detail"]["feature"] == "data_export"


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-05-01", "to": "2026-04-30"},  # From after To (EC-PREM 4)
        {"from": "2026-13-01"},
        {"to": "last-year"},
        {"format": "xlsx"},
        {"include": ""},
        {"include": "receipts,photos"},
        {"include": ","},
    ],
)
async def test_export_rejects_a_bad_range_format_or_include(premium_client, params):
    resp = await premium_client.get(EXPORT, params=params)

    assert resp.status_code == 422, resp.text


async def test_from_after_to_names_the_error(premium_client):
    resp = await premium_client.get(
        SUMMARY, params={"from": "2026-05-01", "to": "2026-04-30"}
    )

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "invalid_range"


async def test_summary_rejects_a_bad_date(premium_client):
    resp = await premium_client.get(SUMMARY, params={"from": "May"})

    assert resp.status_code == 422


async def test_data_exported_carries_format_range_and_includes(
    premium_client, mock_extractor, test_image_bytes
):
    """PREM-04 AC 6: `data_exported` names the format, the range and the
    includes, with the counts."""
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    await _seed(premium_client, mock_extractor, test_image_bytes)
    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )

    await premium_client.get(
        EXPORT, params={"format": "pdf", "include": "receipts,images", **RANGE}
    )

    [(_, props, _user)] = [c for c in spy.calls if c[0] == "data_exported"]
    assert props["format"] == "pdf"
    assert props["from"] == "2025-12-01"
    assert props["to"] == "2026-09-30"
    assert props["includes"] == ["receipts", "images"]
    assert props["receipt_count"] == 2
    assert props["image_count"] == 1
    assert props["images_left_out"] == 1  # the manual receipt


# --- AC 7: all time, everything on ---------------------------------------------


async def test_all_time_with_every_switch_exports_all_the_users_data(
    premium_client, mock_extractor, test_image_bytes, other_user
):
    """PREM-04 AC 7 (NFR Privacy 2): no range and every include is everything
    the user has, and nothing of another user's."""
    seeded = await _seed(premium_client, mock_extractor, test_image_bytes)

    resp = await premium_client.get(EXPORT, params={"include": ALL})
    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    [document] = [n for n in archive.namelist() if n.endswith(".json")]
    body = __import__("json").loads(archive.read(document))

    assert body["range"] == {"from": None, "to": None}
    assert {r["id"] for r in body["receipts"]} == {
        seeded[k]["id"] for k in ("old", "march", "late", "manual")
    }
    assert len(body["price_observations"]) == 5
    assert [b["id"] for b in body["budgets"]] == [seeded["budget"]["id"]]
    assert "Pet food" in {c["name"] for c in body["categories"]}
    assert sum(1 for n in archive.namelist() if n.endswith(".jpg")) == 3
    text = archive.read(document).decode()
    for absent in ("B SECRET CHEESE", "B Secret Cheese", "987.65", "B Secret Category"):
        assert absent not in text
