import io

from PIL import Image, ImageFilter

from app.image.preprocessor import assess_image_quality


def _make_image(
    width: int = 400,
    height: int = 600,
    color: tuple = (180, 180, 180),
    blur_radius: float = 0,
) -> bytes:
    """Generate a test image with optional Gaussian blur."""
    import random

    random.seed(42)
    img = Image.new("RGB", (width, height), color=color)
    pixels = img.load()
    for x in range(0, width, 2):
        for y in range(0, height, 2):
            v = random.randint(100, 200)
            pixels[x, y] = (v, v, v)
    if blur_radius:
        img = img.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_acceptable_image():
    """Normal image passes all quality checks."""
    data = _make_image()
    result = assess_image_quality(data)
    assert result.is_acceptable
    assert result.width == 400
    assert result.height == 600
    assert len(result.issues) == 0


def test_too_small_image():
    """Image below 300px width is rejected."""
    data = _make_image(width=200, height=300)
    result = assess_image_quality(data)
    assert not result.is_acceptable
    assert any("width" in issue.lower() for issue in result.issues)


def test_blurry_image():
    """Heavily blurred image is rejected."""
    data = _make_image(blur_radius=20)
    result = assess_image_quality(data)
    assert not result.is_acceptable
    assert any("blurry" in issue.lower() for issue in result.issues)


def test_dark_image():
    """Very dark image is rejected."""
    # Use a pure dark image without the noise texture
    img = Image.new("RGB", (400, 600), color=(10, 10, 10))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    result = assess_image_quality(buf.getvalue())
    assert not result.is_acceptable
    assert any("dark" in issue.lower() for issue in result.issues)
