import io
import uuid

from httpx import AsyncClient

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
