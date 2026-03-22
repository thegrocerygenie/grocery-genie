import io
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image

MIN_WIDTH = 300  # pixels, per PRD
BLUR_THRESHOLD = 100.0  # Laplacian variance — lower = blurrier
BRIGHTNESS_MIN = 40
BRIGHTNESS_MAX = 250


@dataclass
class ImageQualityResult:
    is_acceptable: bool
    width: int
    height: int
    blur_score: float
    brightness_score: float
    issues: list[str] = field(default_factory=list)


def assess_image_quality(image_data: bytes) -> ImageQualityResult:
    """Assess receipt image quality using Pillow and OpenCV."""
    issues: list[str] = []

    # Get dimensions via Pillow
    img = Image.open(io.BytesIO(image_data))
    width, height = img.size

    if width < MIN_WIDTH:
        issues.append(f"Image width {width}px is below minimum {MIN_WIDTH}px")

    # Convert to OpenCV format for blur/brightness analysis
    img_array = np.array(img.convert("RGB"))
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

    # Blur detection via Laplacian variance
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    blur_score = float(laplacian.var())

    if blur_score < BLUR_THRESHOLD:
        issues.append(f"Image appears blurry (score: {blur_score:.1f})")

    # Brightness check from histogram mean
    brightness_score = float(gray.mean())

    if brightness_score < BRIGHTNESS_MIN:
        issues.append(f"Image is too dark (brightness: {brightness_score:.1f})")
    elif brightness_score > BRIGHTNESS_MAX:
        issues.append(f"Image is too bright (brightness: {brightness_score:.1f})")

    is_acceptable = len(issues) == 0

    return ImageQualityResult(
        is_acceptable=is_acceptable,
        width=width,
        height=height,
        blur_score=blur_score,
        brightness_score=brightness_score,
        issues=issues,
    )
