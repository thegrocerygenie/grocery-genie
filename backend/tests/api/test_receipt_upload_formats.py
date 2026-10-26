"""RC-03: HEIC and PDF uploads go through the same scan flow as camera JPEGs."""

import io
import random

from httpx import AsyncClient
from PIL import Image

from app.core.config import get_settings
from app.image.storage import LocalFileStorage, generate_receipt_path
from app.llm.provider import MockReceiptExtractor, get_receipt_extractor


class _RecordingExtractor(MockReceiptExtractor):
    """Mock extractor that records the bytes and type it was given."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[tuple[bytes, str]] = []

    async def extract(self, image_data: bytes, content_type: str):
        self.calls.append((image_data, content_type))
        return await super().extract(image_data, content_type)


def _install_recording_extractor() -> _RecordingExtractor:
    from main import app

    extractor = _RecordingExtractor()
    app.dependency_overrides[get_receipt_extractor] = lambda: extractor
    return extractor


def _textured(width: int = 400, height: int = 600) -> Image.Image:
    """An image with enough texture to pass the blur check."""
    random.seed(42)
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    pixels = img.load()
    for x in range(0, width, 2):
        for y in range(0, height, 2):
            v = random.randint(100, 200)
            pixels[x, y] = (v, v, v)
    return img


def _heic(width: int = 400, height: int = 600) -> bytes:
    import pillow_heif

    pillow_heif.register_heif_opener()
    buf = io.BytesIO()
    _textured(width, height).save(buf, format="HEIF")
    return buf.getvalue()


def _pdf(width_pt: int = 216, height_pt: int = 432, pages: int = 1) -> bytes:
    """A blank white PDF, like a digital receipt with no photo texture."""
    img = Image.new("RGB", (width_pt, height_pt), "white")
    buf = io.BytesIO()
    img.save(
        buf,
        format="PDF",
        resolution=72,
        save_all=True,
        append_images=[img] * (pages - 1),
    )
    return buf.getvalue()


async def _scan(client: AsyncClient, name: str, data: bytes, content_type: str):
    return await client.post(
        "/api/receipts/scan",
        files={"file": (name, io.BytesIO(data), content_type)},
        data={"source": "pdf" if content_type == "application/pdf" else "library"},
    )


def _is_jpeg(data: bytes) -> bool:
    return Image.open(io.BytesIO(data)).format == "JPEG"


# --- AC1: PNG and HEIC (JPEG is covered by test_receipts.py) ---


async def test_png_scan_passes_through_unconverted(client: AsyncClient):
    extractor = _install_recording_extractor()
    buf = io.BytesIO()
    _textured().save(buf, format="PNG")

    resp = await _scan(client, "screenshot.png", buf.getvalue(), "image/png")

    assert resp.status_code == 200, resp.text
    [(sent, sent_type)] = extractor.calls
    assert sent_type == "image/png"
    assert sent == buf.getvalue()


async def test_heic_scan_sends_jpeg_to_extractor(client: AsyncClient):
    extractor = _install_recording_extractor()

    resp = await _scan(client, "IMG_0001.HEIC", _heic(), "image/heic")

    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "pending_review"
    [(sent, sent_type)] = extractor.calls
    assert sent_type == "image/jpeg"
    assert _is_jpeg(sent)


async def test_heif_content_type_is_accepted(client: AsyncClient):
    resp = await _scan(client, "IMG_0001.HEIF", _heic(), "image/heif")
    assert resp.status_code == 200, resp.text


async def test_heic_receipt_serves_jpeg_image_and_thumbnail(client: AsyncClient):
    resp = await _scan(client, "IMG_0001.HEIC", _heic(), "image/heic")
    receipt_id = resp.json()["receipt_id"]

    image = await client.get(f"/api/receipts/{receipt_id}/image")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"

    thumb = await client.get(f"/api/receipts/{receipt_id}/thumbnail")
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(thumb.content)).width == get_settings().thumbnail_width


async def test_heic_original_is_kept_for_reprocessing(client: AsyncClient):
    original = _heic()
    resp = await _scan(client, "IMG_0001.HEIC", original, "image/heic")
    receipt_id = resp.json()["receipt_id"]

    storage = LocalFileStorage(get_settings().storage_path)
    stored = await storage.read(generate_receipt_path(receipt_id, ".heic"))
    assert stored == original


# --- AC2: single-page PDF ---


async def test_pdf_scan_sends_rendered_jpeg_to_extractor(client: AsyncClient):
    extractor = _install_recording_extractor()

    resp = await _scan(client, "receipt.pdf", _pdf(), "application/pdf")

    assert resp.status_code == 200, resp.text
    [(sent, sent_type)] = extractor.calls
    assert sent_type == "image/jpeg"
    assert _is_jpeg(sent)


async def test_pdf_receipt_serves_jpeg_image_and_keeps_original(client: AsyncClient):
    original = _pdf()
    resp = await _scan(client, "receipt.pdf", original, "application/pdf")
    receipt_id = resp.json()["receipt_id"]

    image = await client.get(f"/api/receipts/{receipt_id}/image")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"

    storage = LocalFileStorage(get_settings().storage_path)
    stored = await storage.read(generate_receipt_path(receipt_id, ".pdf"))
    assert stored == original


async def test_multi_page_pdf_is_rejected_with_422(client: AsyncClient):
    extractor = _install_recording_extractor()

    resp = await _scan(client, "receipt.pdf", _pdf(pages=2), "application/pdf")

    assert resp.status_code == 422
    assert "single-page" in resp.json()["detail"]
    assert extractor.calls == []


async def test_corrupt_pdf_is_rejected_with_422(client: AsyncClient):
    resp = await _scan(client, "receipt.pdf", b"%PDF-1.4 garbage", "application/pdf")
    assert resp.status_code == 422


async def test_corrupt_heic_is_rejected_with_422(client: AsyncClient):
    resp = await _scan(client, "IMG.HEIC", b"not a heic", "image/heic")
    assert resp.status_code == 422


# --- AC4: minimum 300px width, before processing ---


async def test_narrow_heic_is_rejected_before_extraction(client: AsyncClient):
    extractor = _install_recording_extractor()

    resp = await _scan(client, "IMG.HEIC", _heic(299, 600), "image/heic")

    assert resp.status_code == 422
    assert "below minimum 300px" in resp.json()["detail"]
    assert extractor.calls == []


async def test_narrow_pdf_is_rejected_before_extraction(client: AsyncClient):
    """A 1-inch-wide page renders to about 200px at 200 DPI."""
    extractor = _install_recording_extractor()

    resp = await _scan(client, "receipt.pdf", _pdf(72, 432), "application/pdf")

    assert resp.status_code == 422
    assert "below minimum 300px" in resp.json()["detail"]
    assert extractor.calls == []
