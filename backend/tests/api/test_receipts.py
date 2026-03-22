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
