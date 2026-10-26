"""Turn an accepted receipt upload into a JPEG or PNG the pipeline can use.

Camera captures are already JPEG. Library and file uploads (RC-03) can be HEIC
or a single-page PDF, which the quality check, thumbnailer and vision model
cannot read directly, so they are converted here first.
"""

import io
from dataclasses import dataclass

import pillow_heif
import pypdfium2 as pdfium
from PIL import Image, ImageOps, UnidentifiedImageError

pillow_heif.register_heif_opener()

HEIC_TYPES = {"image/heic", "image/heif"}
PDF_TYPE = "application/pdf"

PDF_RENDER_DPI = 200
# Vision models downscale anything larger, so a bigger render only costs bytes.
MAX_RENDER_EDGE = 2048
JPEG_QUALITY = 90


class UnreadableUploadError(ValueError):
    """The upload can't be turned into a receipt image. The message is user-facing."""


@dataclass(frozen=True)
class NormalizedImage:
    data: bytes
    content_type: str
    converted: bool


def normalize_upload(data: bytes, content_type: str) -> NormalizedImage:
    """Return JPEG/PNG bytes for ``data``, converting HEIC and PDF uploads."""
    if content_type in HEIC_TYPES:
        return NormalizedImage(_heic_to_jpeg(data), "image/jpeg", converted=True)
    if content_type == PDF_TYPE:
        return NormalizedImage(_pdf_to_jpeg(data), "image/jpeg", converted=True)
    return NormalizedImage(data, content_type, converted=False)


def _to_jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


def _heic_to_jpeg(data: bytes) -> bytes:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise UnreadableUploadError("Could not read the HEIC image.") from exc
    return _to_jpeg(ImageOps.exif_transpose(img))


def _pdf_to_jpeg(data: bytes) -> bytes:
    try:
        doc = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        raise UnreadableUploadError("Could not read the PDF.") from exc
    try:
        if len(doc) != 1:
            raise UnreadableUploadError(
                f"This PDF has {len(doc)} pages. "
                "Only single-page PDF receipts are supported."
            )
        page = doc[0]
        width_pt, height_pt = page.get_size()
        scale = min(PDF_RENDER_DPI / 72, MAX_RENDER_EDGE / max(width_pt, height_pt))
        img = page.render(scale=scale).to_pil()
        return _to_jpeg(img)
    finally:
        doc.close()
