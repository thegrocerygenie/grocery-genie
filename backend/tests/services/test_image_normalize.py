"""RC-03: library and file uploads are normalized to a JPEG/PNG before processing."""

import io

import pytest
from PIL import Image

from app.image.normalize import UnreadableUploadError, normalize_upload
from app.image.preprocessor import assess_image_quality


def _image(width: int = 400, height: int = 600) -> Image.Image:
    return Image.new("RGB", (width, height), "white")


def _heic(width: int = 400, height: int = 600) -> bytes:
    import pillow_heif

    pillow_heif.register_heif_opener()
    buf = io.BytesIO()
    _image(width, height).save(buf, format="HEIF")
    return buf.getvalue()


def _pdf(width_pt: int = 216, height_pt: int = 432, pages: int = 1) -> bytes:
    """A PDF whose pages are width_pt x height_pt points (1 pt = 1/72 in)."""
    img = _image(width_pt, height_pt)
    buf = io.BytesIO()
    img.save(
        buf,
        format="PDF",
        resolution=72,
        save_all=True,
        append_images=[img] * (pages - 1),
    )
    return buf.getvalue()


def _jpeg() -> bytes:
    buf = io.BytesIO()
    _image().save(buf, format="JPEG")
    return buf.getvalue()


def test_jpeg_passes_through_unchanged():
    data = _jpeg()
    result = normalize_upload(data, "image/jpeg")
    assert result.data == data
    assert result.content_type == "image/jpeg"
    assert result.converted is False


def test_heic_converts_to_jpeg_at_full_size():
    result = normalize_upload(_heic(400, 600), "image/heic")
    assert result.content_type == "image/jpeg"
    assert result.converted is True
    img = Image.open(io.BytesIO(result.data))
    assert img.format == "JPEG"
    assert img.size == (400, 600)


def test_heif_content_type_is_treated_as_heic():
    result = normalize_upload(_heic(), "image/heif")
    assert result.content_type == "image/jpeg"
    assert result.converted is True


def test_single_page_pdf_renders_to_jpeg_at_200_dpi():
    # A 3 x 6 inch page renders at 200 DPI to about 600 x 1200 px.
    result = normalize_upload(_pdf(216, 432), "application/pdf")
    assert result.content_type == "image/jpeg"
    assert result.converted is True
    img = Image.open(io.BytesIO(result.data))
    assert img.format == "JPEG"
    assert abs(img.width - 600) <= 2
    assert abs(img.height - 1200) <= 2


def test_pdf_render_caps_the_long_edge():
    # A 20-inch-tall page would render at 4000 px; it is capped at 2048.
    result = normalize_upload(_pdf(216, 1440), "application/pdf")
    img = Image.open(io.BytesIO(result.data))
    assert max(img.size) <= 2048


def test_multi_page_pdf_is_rejected():
    with pytest.raises(UnreadableUploadError, match="single-page"):
        normalize_upload(_pdf(pages=2), "application/pdf")


def test_corrupt_pdf_is_rejected():
    with pytest.raises(UnreadableUploadError):
        normalize_upload(b"%PDF-1.4 not really a pdf", "application/pdf")


def test_corrupt_heic_is_rejected():
    with pytest.raises(UnreadableUploadError):
        normalize_upload(b"not a heic file", "image/heic")


def test_photo_checks_can_be_skipped_but_width_still_applies():
    """A rendered PDF is not a photo: skip blur/brightness, keep the 300px rule."""
    blank = io.BytesIO()
    _image(400, 600).save(blank, format="JPEG")
    assert assess_image_quality(blank.getvalue()).is_acceptable is False
    assert assess_image_quality(blank.getvalue(), photo=False).is_acceptable is True

    narrow = io.BytesIO()
    _image(299, 600).save(narrow, format="JPEG")
    result = assess_image_quality(narrow.getvalue(), photo=False)
    assert result.is_acceptable is False
    assert any("below minimum 300px" in issue for issue in result.issues)
