"""DoD box 19, scoped 2026-11-02 to scanned receipts: every confirmed scan's
original image and thumbnail can be fetched. Manual receipts have no image by
design (the DoD exempts them)."""

import io

from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select

from app.models.database import Receipt


def _png(image_bytes: bytes) -> bytes:
    out = io.BytesIO()
    Image.open(io.BytesIO(image_bytes)).save(out, format="PNG")
    return out.getvalue()


def _pdf(image_bytes: bytes) -> bytes:
    out = io.BytesIO()
    Image.open(io.BytesIO(image_bytes)).convert("RGB").save(out, format="PDF")
    return out.getvalue()


async def test_every_confirmed_scan_has_its_image_and_thumbnail(
    client: AsyncClient, db_session, test_image_bytes: bytes
):
    uploads = [
        ("receipt.jpg", test_image_bytes, "image/jpeg"),
        ("receipt.png", _png(test_image_bytes), "image/png"),
        ("receipt.pdf", _pdf(test_image_bytes), "application/pdf"),
    ]
    for name, data, content_type in uploads:
        scan = await client.post(
            "/api/receipts/scan",
            files={"file": (name, io.BytesIO(data), content_type)},
        )
        assert scan.status_code == 200, scan.text
        confirm = await client.patch(
            f"/api/receipts/{scan.json()['receipt_id']}", json={"status": "confirmed"}
        )
        assert confirm.status_code == 200

    confirmed = (
        await db_session.execute(
            select(Receipt.id, Receipt.image_url).where(Receipt.status == "confirmed")
        )
    ).all()
    assert len(confirmed) == len(uploads)
    for receipt_id, image_url in confirmed:
        assert image_url == f"/api/receipts/{receipt_id}/image"
        image = await client.get(image_url)
        thumb = await client.get(f"/api/receipts/{receipt_id}/thumbnail")
        assert image.status_code == 200 and image.content, receipt_id
        assert image.headers["content-type"].startswith("image/")
        assert thumb.status_code == 200 and thumb.content, receipt_id


async def test_a_manual_receipt_has_no_image(client: AsyncClient):
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner",
            "date": "2026-03-15",
            "total": 2.0,
            "items": [{"name": "Bread", "unit_price": 2.0, "total_price": 2.0}],
        },
    )

    assert resp.status_code == 201
    assert resp.json()["image_url"] is None
    image = await client.get(f"/api/receipts/{resp.json()['id']}/image")
    assert image.status_code == 404
