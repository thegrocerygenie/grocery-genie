"""The scan route when receipt extraction can't finish (DoD boxes 8 and 10).

A timeout, an unavailable provider, or output the schema rejects answers 503
with a short message. The app retries any 5xx scan from its offline queue.
Each saved receipt records the model and prompt version that read it.
"""

import io
import uuid

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.provider import (
    PROMPT_VERSION,
    ExtractionUnavailableError,
    get_receipt_extractor,
)
from app.models.database import Receipt


class _UnavailableExtractor:
    model_name = "anthropic/claude-sonnet-5-5"
    prompt_version = PROMPT_VERSION

    async def extract(self, image_data: bytes, content_type: str):
        raise ExtractionUnavailableError("timed out")


async def _scan(client: AsyncClient, image: bytes):
    return await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image), "image/jpeg")},
    )


async def test_scan_answers_503_when_extraction_is_unavailable(
    client: AsyncClient, db_session: AsyncSession, test_image_bytes: bytes
):
    from main import app

    app.dependency_overrides[get_receipt_extractor] = _UnavailableExtractor

    response = await _scan(client, test_image_bytes)

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Couldn't read the receipt right now. Try again in a moment."
    )
    count = await db_session.scalar(select(func.count()).select_from(Receipt))
    assert count == 0


async def test_scan_records_the_model_and_prompt_version(
    client: AsyncClient, db_session: AsyncSession, test_image_bytes: bytes
):
    response = await _scan(client, test_image_bytes)
    assert response.status_code == 200

    receipt = await db_session.get(Receipt, uuid.UUID(response.json()["receipt_id"]))
    assert receipt is not None
    assert receipt.extraction_model == "mock"
    assert receipt.extraction_prompt_version == PROMPT_VERSION
