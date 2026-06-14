import asyncio
import io
import logging
import os
import uuid
from typing import Protocol

from PIL import Image

logger = logging.getLogger(__name__)

# Extensions a stored receipt image may use, and the thumbnail extension.
RECEIPT_EXTS = (".jpg", ".png", ".heic", ".pdf")
THUMBNAIL_EXT = ".jpg"

_EXT_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
}


def media_type_for_path(path: str) -> str:
    """Best-effort media type from a stored file path's extension."""
    _, ext = os.path.splitext(path)
    return _EXT_MEDIA_TYPES.get(ext.lower(), "application/octet-stream")


class FileStorage(Protocol):
    async def save(self, data: bytes, path: str) -> str: ...
    async def get_url(self, path: str) -> str: ...
    async def read(self, path: str) -> bytes | None: ...


class LocalFileStorage:
    """Local filesystem storage. Designed for S3-compatible swap later."""

    def __init__(self, base_path: str) -> None:
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)

    async def save(self, data: bytes, path: str) -> str:
        full_path = os.path.join(self.base_path, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
        return path

    async def get_url(self, path: str) -> str:
        return f"/uploads/{path}"

    async def read(self, path: str) -> bytes | None:
        """Return the bytes at ``path`` or None if the file does not exist."""
        full_path = os.path.join(self.base_path, path)

        def _read() -> bytes | None:
            if not os.path.isfile(full_path):
                return None
            with open(full_path, "rb") as f:
                return f.read()

        return await asyncio.to_thread(_read)


def generate_receipt_path(receipt_id: uuid.UUID, suffix: str = ".jpg") -> str:
    """Generate a storage path for a receipt image."""
    return f"receipts/{receipt_id}{suffix}"


def generate_thumbnail_path(receipt_id: uuid.UUID, suffix: str = ".jpg") -> str:
    """Generate a storage path for a receipt thumbnail."""
    return f"receipts/{receipt_id}_thumb{suffix}"


def create_thumbnail(image_data: bytes, max_width: int = 200) -> bytes:
    """Create a compressed thumbnail from image data."""
    img = Image.open(io.BytesIO(image_data))
    ratio = max_width / img.width
    new_height = int(img.height * ratio)
    img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=75)
    return buffer.getvalue()
