import io
import uuid

import pytest
from httpx import AsyncClient

from app.core.seed import seed_default_categories
from app.llm.provider import (
    LowConfidenceMockExtractor,
    get_receipt_extractor,
)

# --- Helper ---


async def _create_receipt(client: AsyncClient, image_bytes: bytes) -> dict:
    """POST a scan and return the response JSON."""
    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
    )
    assert resp.status_code == 200
    return resp.json()


def _install_analytics_spy() -> list[tuple[str, dict, uuid.UUID]]:
    """Override get_analytics_service with a spy; return the captured calls list.

    The `client` fixture clears dependency_overrides on teardown.
    """
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    calls: list[tuple[str, dict, uuid.UUID]] = []

    class _Spy:
        def emit(self, event_name, properties, user_id) -> None:
            calls.append((event_name, properties, user_id))

    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=_Spy()
    )
    return calls


# --- Receipt image serving (ownership-checked) tests ---


async def test_receipt_image_served_to_owner(
    client: AsyncClient, test_image_bytes: bytes
):
    """H4: a receipt's owner can fetch its image via the authenticated route."""
    data = await _create_receipt(client, test_image_bytes)
    image_url = f"/api/receipts/{data['receipt_id']}/image"

    resp = await client.get(image_url)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert resp.content == test_image_bytes


async def test_receipt_image_unknown_id_returns_404(client: AsyncClient):
    resp = await client.get(f"/api/receipts/{uuid.uuid4()}/image")
    assert resp.status_code == 404


async def test_scan_rejects_oversized_upload(client: AsyncClient):
    """H4/size-cap: an upload above the 10 MB ceiling is rejected with 413."""
    big = io.BytesIO(b"\xff" * (10 * 1024 * 1024 + 1))
    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("huge.jpg", big, "image/jpeg")},
    )
    assert resp.status_code == 413


# --- POST /api/receipts/scan tests ---


async def test_successful_extraction(client: AsyncClient, test_image_bytes: bytes):
    """POST /api/receipts/scan with valid image returns extraction."""
    data = await _create_receipt(client, test_image_bytes)

    assert "receipt_id" in data
    assert data["status"] == "pending_review"
    assert "extraction" in data

    extraction = data["extraction"]
    assert extraction["store_name"] == "Test Grocery Store"
    assert extraction["date"] == "2026-03-15"
    assert len(extraction["items"]) == 3
    assert extraction["confidence"] > 0.5


async def test_scan_emits_source_from_form_field(
    client: AsyncClient, test_image_bytes: bytes
):
    """receipt_scan_started carries the source supplied as a form field."""
    calls = _install_analytics_spy()

    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        data={"source": "library"},
    )
    assert resp.status_code == 200
    scan_started = [c for c in calls if c[0] == "receipt_scan_started"]
    assert len(scan_started) == 1
    assert scan_started[0][1] == {"source": "library"}


async def test_scan_invalid_source_falls_back_to_camera(
    client: AsyncClient, test_image_bytes: bytes
):
    """An unrecognised source falls back to 'camera' — analytics never blocks a scan."""
    calls = _install_analytics_spy()

    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        data={"source": "hacker"},
    )
    assert resp.status_code == 200
    scan_started = [c for c in calls if c[0] == "receipt_scan_started"]
    assert len(scan_started) == 1
    assert scan_started[0][1] == {"source": "camera"}


async def test_scan_defaults_source_to_camera(
    client: AsyncClient, test_image_bytes: bytes
):
    """Omitting the source form field defaults to 'camera'."""
    calls = _install_analytics_spy()

    resp = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )
    assert resp.status_code == 200
    scan_started = [c for c in calls if c[0] == "receipt_scan_started"]
    assert len(scan_started) == 1
    assert scan_started[0][1] == {"source": "camera"}


async def test_invalid_file_type(client: AsyncClient):
    """POST /api/receipts/scan with .txt file returns 422."""
    response = await client.post(
        "/api/receipts/scan",
        files={"file": ("notes.txt", io.BytesIO(b"not an image"), "text/plain")},
    )
    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]


async def test_non_receipt_rejection(client: AsyncClient, test_image_bytes: bytes):
    """POST /api/receipts/scan with low confidence returns error."""
    from main import app

    app.dependency_overrides[get_receipt_extractor] = lambda: (
        LowConfidenceMockExtractor()
    )

    response = await client.post(
        "/api/receipts/scan",
        files={
            "file": (
                "photo.jpg",
                io.BytesIO(test_image_bytes),
                "image/jpeg",
            )
        },
    )
    assert response.status_code == 422
    assert "doesn't appear to be a receipt" in response.json()["detail"]


# --- GET /api/receipts/{id} tests ---


async def test_get_receipt(client: AsyncClient, test_image_bytes: bytes):
    """GET /api/receipts/{id} returns full receipt with items."""
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]

    response = await client.get(f"/api/receipts/{receipt_id}")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == receipt_id
    assert data["store_name"] == "Test Grocery Store"
    assert data["status"] == "pending_review"
    assert len(data["items"]) == 3
    assert data["items"][0]["raw_name"] == "Organic Bananas"


async def test_get_receipt_not_found(client: AsyncClient):
    """GET /api/receipts/{random-uuid} returns 404."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/receipts/{fake_id}")
    assert response.status_code == 404


# --- PATCH /api/receipts/{id} tests ---


async def test_update_receipt_confirm(client: AsyncClient, test_image_bytes: bytes):
    """PATCH with status confirmed commits the receipt."""
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]

    response = await client.patch(
        f"/api/receipts/{receipt_id}",
        json={"status": "confirmed"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


async def test_update_receipt_correct_item(
    client: AsyncClient, test_image_bytes: bytes
):
    """PATCH with item name correction updates the item."""
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]
    item_id = scan["extraction"]["items"][0]["id"]

    response = await client.patch(
        f"/api/receipts/{receipt_id}",
        json={
            "items": [{"id": item_id, "name": "Corrected Bananas"}],
        },
    )
    assert response.status_code == 200

    corrected_item = next(i for i in response.json()["items"] if i["id"] == item_id)
    assert corrected_item["raw_name"] == "Corrected Bananas"
    assert corrected_item["corrected"] is True


async def test_update_receipt_not_found(client: AsyncClient):
    """PATCH on non-existent receipt returns 404."""
    fake_id = str(uuid.uuid4())
    response = await client.patch(
        f"/api/receipts/{fake_id}",
        json={"status": "confirmed"},
    )
    assert response.status_code == 404


# --- GET /api/receipts (list) tests ---


async def test_list_receipts_empty(client: AsyncClient):
    """GET /api/receipts with no data returns empty list."""
    response = await client.get("/api/receipts")
    assert response.status_code == 200

    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


async def test_list_receipts_with_data(client: AsyncClient, test_image_bytes: bytes):
    """GET /api/receipts returns scanned receipts."""
    await _create_receipt(client, test_image_bytes)
    await _create_receipt(client, test_image_bytes)

    response = await client.get("/api/receipts")
    assert response.status_code == 200

    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["items"][0]["store_name"] == "Test Grocery Store"


async def test_list_receipts_pagination(client: AsyncClient, test_image_bytes: bytes):
    """GET /api/receipts respects pagination params."""
    await _create_receipt(client, test_image_bytes)
    await _create_receipt(client, test_image_bytes)
    await _create_receipt(client, test_image_bytes)

    response = await client.get("/api/receipts?page=1&per_page=2")
    assert response.status_code == 200

    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["per_page"] == 2


# --- GET /api/receipts filter tests (RC-04: Scan History search) ---


async def test_list_receipts_filter_by_store(
    client: AsyncClient, test_image_bytes: bytes, mock_extractor
):
    """GET /api/receipts?store=... filters by store name (partial, case-insensitive)."""
    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    mock_extractor._result = ReceiptExtractionResult(
        store_name="Loblaws Downtown",
        date="2026-03-10",
        currency="CAD",
        items=[
            ExtractedLineItem(
                name="Apples",
                quantity=1,
                unit_price=3.0,
                total_price=3.0,
                confidence=0.9,
            )
        ],
        subtotal=3.0,
        total=3.0,
        confidence=0.85,
    )
    await _create_receipt(client, test_image_bytes)

    mock_extractor._result = ReceiptExtractionResult(
        store_name="No Frills",
        date="2026-03-12",
        currency="CAD",
        items=[
            ExtractedLineItem(
                name="Bread",
                quantity=1,
                unit_price=2.0,
                total_price=2.0,
                confidence=0.9,
            )
        ],
        subtotal=2.0,
        total=2.0,
        confidence=0.85,
    )
    await _create_receipt(client, test_image_bytes)

    mock_extractor._result = None

    resp = await client.get("/api/receipts?store=loblaws")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["store_name"] == "Loblaws Downtown"


async def test_list_receipts_filter_by_date_range(
    client: AsyncClient, test_image_bytes: bytes, mock_extractor
):
    """GET /api/receipts?from_date=...&to_date=... filters by receipt date."""
    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    for store, receipt_date in [
        ("Store Jan", "2026-01-15"),
        ("Store Feb", "2026-02-20"),
        ("Store Mar", "2026-03-05"),
    ]:
        mock_extractor._result = ReceiptExtractionResult(
            store_name=store,
            date=receipt_date,
            currency="USD",
            items=[
                ExtractedLineItem(
                    name="Item",
                    quantity=1,
                    unit_price=10.0,
                    total_price=10.0,
                    confidence=0.9,
                )
            ],
            subtotal=10.0,
            total=10.0,
            confidence=0.85,
        )
        await _create_receipt(client, test_image_bytes)

    mock_extractor._result = None

    resp = await client.get("/api/receipts?from_date=2026-02-01&to_date=2026-02-28")
    assert resp.status_code == 200
    data = resp.json()
    # Both the returned page and the total count must reflect the date range.
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["store_name"] == "Store Feb"


async def test_list_receipts_store_and_date_filters_compose(
    client: AsyncClient, test_image_bytes: bytes, mock_extractor
):
    """store + from_date + to_date filters compose for both items and total."""
    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    for store, receipt_date in [
        ("Loblaws", "2026-01-15"),
        ("Loblaws", "2026-02-20"),
        ("No Frills", "2026-02-22"),
    ]:
        mock_extractor._result = ReceiptExtractionResult(
            store_name=store,
            date=receipt_date,
            currency="USD",
            items=[
                ExtractedLineItem(
                    name="Item",
                    quantity=1,
                    unit_price=10.0,
                    total_price=10.0,
                    confidence=0.9,
                )
            ],
            subtotal=10.0,
            total=10.0,
            confidence=0.85,
        )
        await _create_receipt(client, test_image_bytes)

    mock_extractor._result = None

    resp = await client.get(
        "/api/receipts?store=loblaws&from_date=2026-02-01&to_date=2026-02-28"
    )
    assert resp.status_code == 200
    data = resp.json()
    # Only the February Loblaws receipt matches all three filters.
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["store_name"] == "Loblaws"


async def test_list_receipts_filter_from_date_only(
    client: AsyncClient, test_image_bytes: bytes, mock_extractor
):
    """GET /api/receipts?from_date=... filters with only a lower bound."""
    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    for store, receipt_date in [
        ("Store Jan", "2026-01-15"),
        ("Store Feb", "2026-02-20"),
        ("Store Mar", "2026-03-05"),
    ]:
        mock_extractor._result = ReceiptExtractionResult(
            store_name=store,
            date=receipt_date,
            currency="USD",
            items=[
                ExtractedLineItem(
                    name="Item",
                    quantity=1,
                    unit_price=10.0,
                    total_price=10.0,
                    confidence=0.9,
                )
            ],
            subtotal=10.0,
            total=10.0,
            confidence=0.85,
        )
        await _create_receipt(client, test_image_bytes)

    mock_extractor._result = None

    resp = await client.get("/api/receipts?from_date=2026-02-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    store_names = {i["store_name"] for i in data["items"]}
    assert store_names == {"Store Feb", "Store Mar"}


async def test_list_receipts_filter_no_match_returns_empty(
    client: AsyncClient, test_image_bytes: bytes
):
    """GET /api/receipts?store=nomatch returns empty list when no store matches."""
    await _create_receipt(client, test_image_bytes)

    resp = await client.get("/api/receipts?store=nonexistentstorexyz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_receipts_ordered_reverse_chronological(
    client: AsyncClient, test_image_bytes: bytes, mock_extractor
):
    """GET /api/receipts returns receipts in reverse chronological order (RC-04)."""
    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    for receipt_date in ["2026-01-01", "2026-02-01", "2026-03-01"]:
        mock_extractor._result = ReceiptExtractionResult(
            store_name="Test Store",
            date=receipt_date,
            currency="USD",
            items=[
                ExtractedLineItem(
                    name="Item",
                    quantity=1,
                    unit_price=5.0,
                    total_price=5.0,
                    confidence=0.9,
                )
            ],
            subtotal=5.0,
            total=5.0,
            confidence=0.85,
        )
        await _create_receipt(client, test_image_bytes)

    mock_extractor._result = None

    resp = await client.get("/api/receipts")
    assert resp.status_code == 200
    items = resp.json()["items"]
    dates = [i["date"] for i in items]
    assert dates == sorted(dates, reverse=True)


@pytest.fixture
async def seeded_categories(db_session):
    await seed_default_categories(db_session)


async def _category_id(client: AsyncClient, name: str) -> str:
    resp = await client.get("/api/categories")
    assert resp.status_code == 200
    return next(c["id"] for c in resp.json() if c["name"] == name)


async def test_name_and_category_correction_applies_on_next_scan(
    client: AsyncClient, test_image_bytes: bytes, seeded_categories
):
    """Correcting name and category together must still teach the next scan.

    The next scan extracts the original name, so the mapping has to be keyed
    on that name, not on the user's corrected one.
    """
    household_id = await _category_id(client, "Household")
    scan = await _create_receipt(client, test_image_bytes)
    bananas = next(
        i for i in scan["extraction"]["items"] if i["name"] == "Organic Bananas"
    )

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={
            "items": [
                {"id": bananas["id"], "name": "Bananas", "category_id": household_id}
            ],
            "status": "confirmed",
        },
    )
    assert resp.status_code == 200

    rescan = await _create_receipt(client, test_image_bytes)
    rescanned = next(
        i for i in rescan["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    assert rescanned["category_id"] == household_id
    assert rescanned["category_confidence"] == 1.0


async def test_category_only_correction_applies_on_next_scan(
    client: AsyncClient, test_image_bytes: bytes, seeded_categories
):
    """Regression guard for the path that already worked."""
    household_id = await _category_id(client, "Household")
    scan = await _create_receipt(client, test_image_bytes)
    milk = next(
        i for i in scan["extraction"]["items"] if i["name"] == "Whole Milk 1 Gal"
    )

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": milk["id"], "category_id": household_id}]},
    )
    assert resp.status_code == 200

    rescan = await _create_receipt(client, test_image_bytes)
    rescanned = next(
        i for i in rescan["extraction"]["items"] if i["name"] == "Whole Milk 1 Gal"
    )
    assert rescanned["category_id"] == household_id


async def test_update_receipt_corrects_item_price(
    client: AsyncClient, test_image_bytes: bytes
):
    """A price edit on the review screen must be saved, not dropped."""
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]
    item_id = scan["extraction"]["items"][0]["id"]

    resp = await client.patch(
        f"/api/receipts/{receipt_id}",
        json={"items": [{"id": item_id, "total_price": 2.50}]},
    )
    assert resp.status_code == 200
    item = next(i for i in resp.json()["items"] if i["id"] == item_id)
    assert item["total_price"] == 2.50
    assert item["unit_price"] == 2.50  # quantity is 1
    assert item["corrected"] is True

    fetched = await client.get(f"/api/receipts/{receipt_id}")
    item = next(i for i in fetched.json()["items"] if i["id"] == item_id)
    assert item["total_price"] == 2.50


async def test_update_receipt_rejects_negative_price(
    client: AsyncClient, test_image_bytes: bytes
):
    scan = await _create_receipt(client, test_image_bytes)
    item_id = scan["extraction"]["items"][0]["id"]

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": item_id, "total_price": -1}]},
    )
    assert resp.status_code == 422


async def test_update_receipt_corrects_store_name(
    client: AsyncClient, test_image_bytes: bytes
):
    """A store-name edit on the review screen must be saved, not dropped."""
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]

    resp = await client.patch(
        f"/api/receipts/{receipt_id}", json={"store_name": "Corner Market"}
    )
    assert resp.status_code == 200
    assert resp.json()["store_name"] == "Corner Market"

    fetched = await client.get(f"/api/receipts/{receipt_id}")
    assert fetched.json()["store_name"] == "Corner Market"


# --- RC-02 AC 1: the receipt date is editable ---


async def test_update_receipt_corrects_date(
    client: AsyncClient, test_image_bytes: bytes
):
    """A date edit on the review screen is saved."""
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]

    resp = await client.patch(
        f"/api/receipts/{receipt_id}", json={"date": "2026-03-20"}
    )

    assert resp.status_code == 200
    assert resp.json()["date"] == "2026-03-20"
    fetched = await client.get(f"/api/receipts/{receipt_id}")
    assert fetched.json()["date"] == "2026-03-20"


async def test_confirm_with_corrected_date_moves_spend_to_that_month(
    client: AsyncClient, test_image_bytes: bytes
):
    """The mock receipt is dated 2026-03-15; the user says it was 2026-04-02."""
    scan = await _create_receipt(client, test_image_bytes)

    await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"date": "2026-04-02", "status": "confirmed"},
    )

    march = (await client.get("/api/dashboard/spending?period=2026-03")).json()
    april = (await client.get("/api/dashboard/spending?period=2026-04")).json()
    assert march["overall"]["spent"] == 0.0
    assert april["overall"]["spent"] == 14.77


async def test_date_correction_is_recorded_as_a_correction(
    client: AsyncClient, test_image_bytes: bytes
):
    calls = _install_analytics_spy()
    scan = await _create_receipt(client, test_image_bytes)

    await client.patch(
        f"/api/receipts/{scan['receipt_id']}", json={"date": "2026-03-20"}
    )

    corrections = [p for name, p, _ in calls if name == "receipt_correction_made"]
    assert {
        "field": "date",
        "original_value": "2026-03-15",
        "corrected_value": "2026-03-20",
    } in corrections


async def test_update_receipt_rejects_a_future_date(
    client: AsyncClient, test_image_bytes: bytes
):
    from datetime import date, timedelta

    scan = await _create_receipt(client, test_image_bytes)
    too_late = (date.today() + timedelta(days=2)).isoformat()

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}", json={"date": too_late}
    )

    assert resp.status_code == 422
    fetched = await client.get(f"/api/receipts/{scan['receipt_id']}")
    assert fetched.json()["date"] == "2026-03-15"


async def test_scan_reports_the_stored_date_when_extracted_date_is_unreadable(
    client: AsyncClient, test_image_bytes: bytes, mock_extractor
):
    """The review screen edits the date the scan returns, so it must be the
    date the server stored (today, for an unreadable one), in ISO form."""
    from datetime import date

    from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult

    mock_extractor._result = ReceiptExtractionResult(
        store_name="Corner Market",
        date="15/03/2026",
        items=[
            ExtractedLineItem(
                name="Apples",
                quantity=1,
                unit_price=3.0,
                total_price=3.0,
                confidence=0.9,
            )
        ],
        subtotal=3.0,
        total=3.0,
        confidence=0.85,
    )
    scan = await _create_receipt(client, test_image_bytes)
    mock_extractor._result = None

    stored = (await client.get(f"/api/receipts/{scan['receipt_id']}")).json()
    assert stored["date"] == date.today().isoformat()
    assert scan["extraction"]["date"] == stored["date"]


# --- RC-02 AC 1: item quantity is editable ---
# The line total is what was paid and what spend sums, so a quantity edit
# keeps total_price and recomputes unit_price (user decision, 2026-10-26).


async def test_update_receipt_corrects_quantity_and_keeps_the_total(
    client: AsyncClient, test_image_bytes: bytes
):
    scan = await _create_receipt(client, test_image_bytes)
    receipt_id = scan["receipt_id"]
    item_id = scan["extraction"]["items"][2]["id"]  # Paper Towels, 1 x 8.49

    resp = await client.patch(
        f"/api/receipts/{receipt_id}",
        json={"items": [{"id": item_id, "quantity": 3}]},
    )

    assert resp.status_code == 200
    item = next(i for i in resp.json()["items"] if i["id"] == item_id)
    assert item["quantity"] == 3
    assert item["total_price"] == 8.49
    assert item["unit_price"] == 2.83
    assert item["corrected"] is True
    fetched = await client.get(f"/api/receipts/{receipt_id}")
    item = next(i for i in fetched.json()["items"] if i["id"] == item_id)
    assert item["quantity"] == 3


async def test_quantity_and_price_corrected_together_set_the_unit_price(
    client: AsyncClient, test_image_bytes: bytes
):
    scan = await _create_receipt(client, test_image_bytes)
    item_id = scan["extraction"]["items"][1]["id"]  # Whole Milk, 1 x 4.99

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": item_id, "quantity": 2, "total_price": 9.00}]},
    )

    item = next(i for i in resp.json()["items"] if i["id"] == item_id)
    assert (item["quantity"], item["total_price"], item["unit_price"]) == (
        2,
        9.00,
        4.50,
    )


async def test_quantity_correction_is_recorded_as_a_correction(
    client: AsyncClient, test_image_bytes: bytes
):
    calls = _install_analytics_spy()
    scan = await _create_receipt(client, test_image_bytes)
    item_id = scan["extraction"]["items"][0]["id"]

    await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": item_id, "quantity": 1.105}]},
    )

    corrections = [p for name, p, _ in calls if name == "receipt_correction_made"]
    assert {
        "field": "quantity",
        "original_value": "1",
        "corrected_value": "1.105",
    } in corrections


async def test_unchanged_quantity_is_not_a_correction(
    client: AsyncClient, test_image_bytes: bytes
):
    calls = _install_analytics_spy()
    scan = await _create_receipt(client, test_image_bytes)
    item_id = scan["extraction"]["items"][0]["id"]

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": item_id, "quantity": 1}]},
    )

    item = next(i for i in resp.json()["items"] if i["id"] == item_id)
    assert item["corrected"] is False
    assert not [p for name, p, _ in calls if name == "receipt_correction_made"]


@pytest.mark.parametrize("quantity", [0, -1])
async def test_update_receipt_rejects_a_non_positive_quantity(
    client: AsyncClient, test_image_bytes: bytes, quantity: float
):
    scan = await _create_receipt(client, test_image_bytes)
    item_id = scan["extraction"]["items"][0]["id"]

    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}",
        json={"items": [{"id": item_id, "quantity": quantity}]},
    )

    assert resp.status_code == 422
