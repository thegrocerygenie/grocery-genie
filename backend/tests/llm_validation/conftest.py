import json
from pathlib import Path

import pytest

RECEIPTS_DIR = Path(__file__).parent / "receipts"
GROUND_TRUTH_DIR = Path(__file__).parent / "ground_truth"


def _load_ground_truth() -> list[dict]:
    """Load all ground truth JSON files."""
    truth_files = sorted(GROUND_TRUTH_DIR.glob("*.json"))
    return [json.loads(f.read_text()) for f in truth_files]


def _load_receipt_image(receipt_id: str) -> bytes | None:
    """Load a receipt image by ID, trying multiple extensions."""
    for ext in (".jpg", ".jpeg", ".png", ".heic", ".pdf"):
        path = RECEIPTS_DIR / f"{receipt_id}{ext}"
        if path.exists():
            return path.read_bytes()
    return None


@pytest.fixture
def ground_truth_set() -> list[dict]:
    """All ground truth records."""
    return _load_ground_truth()


@pytest.fixture
def receipt_test_set() -> list[tuple[bytes, dict]]:
    """Paired receipt images and ground truth.

    Only includes entries where both the image file and ground truth exist.
    """
    pairs = []
    for truth in _load_ground_truth():
        image_data = _load_receipt_image(truth["receipt_id"])
        if image_data is not None:
            pairs.append((image_data, truth))
    return pairs


@pytest.fixture
def single_receipt():
    """Factory fixture to load a specific receipt by ID."""

    def _load(receipt_id: str) -> tuple[bytes, dict] | None:
        truth_path = GROUND_TRUTH_DIR / f"{receipt_id}.json"
        if not truth_path.exists():
            return None
        truth = json.loads(truth_path.read_text())
        image_data = _load_receipt_image(receipt_id)
        if image_data is None:
            return None
        return (image_data, truth)

    return _load
