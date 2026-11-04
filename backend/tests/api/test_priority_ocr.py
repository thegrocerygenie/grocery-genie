"""Priority OCR through the scan route (PREM-03 AC 2, 4, 5; EC-PREM 3).

A Premium user's scan is read by the Premium extraction model, a free user's by
the default one. Premium is the server's state (written only from RevenueCat),
read when extraction starts. A Premium model that fails hands the scan to the
default model; a scan never fails because of it.
"""

import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.provider import (
    PROMPT_VERSION,
    ExtractionUnavailableError,
    MockReceiptExtractor,
    get_premium_receipt_extractor,
    get_receipt_extractor,
)
from app.models.database import AnalyticsEvent, Receipt, User
from tests.api.test_analytics_sink import SessionWriter
from tests.conftest import DEV_USER_ID

PREMIUM_MODEL = "test-provider/stronger-vision"


class _RecordingExtractor(MockReceiptExtractor):
    def __init__(self, model_name: str) -> None:
        super().__init__(model_name=model_name)
        self.calls = 0

    async def extract(self, image_data: bytes, content_type: str):
        self.calls += 1
        return await super().extract(image_data, content_type)


class _FailingExtractor:
    """A model that is down, or whose answer failed validation."""

    prompt_version = PROMPT_VERSION

    def __init__(self, model_name: str, error: Exception) -> None:
        self.model_name = model_name
        self.error = error
        self.calls = 0

    async def extract(self, image_data: bytes, content_type: str):
        self.calls += 1
        raise self.error


@pytest.fixture
def default_extractor() -> _RecordingExtractor:
    from main import app

    extractor = _RecordingExtractor("default-provider/default-model")
    app.dependency_overrides[get_receipt_extractor] = lambda: extractor
    return extractor


@pytest.fixture
def premium_extractor() -> _RecordingExtractor:
    from main import app

    extractor = _RecordingExtractor(PREMIUM_MODEL)
    app.dependency_overrides[get_premium_receipt_extractor] = lambda: extractor
    return extractor


@pytest.fixture
def events(db_session):
    from app.services.analytics_service import get_analytics_writer
    from main import app

    app.dependency_overrides[get_analytics_writer] = lambda: SessionWriter(db_session)

    async def completed() -> list[dict]:
        rows = await db_session.execute(
            select(AnalyticsEvent)
            .where(AnalyticsEvent.event_name == "receipt_extraction_completed")
            .order_by(AnalyticsEvent.created_at)
        )
        return [row.properties for row in rows.scalars()]

    return completed


async def _set_premium(db: AsyncSession, active: bool, days: int = 30) -> None:
    """Write the entitlement as RevenueCat's webhook would."""
    user = await db.get(User, DEV_USER_ID)
    assert user is not None
    user.premium_active = active
    user.premium_expires_at = datetime.now(UTC) + timedelta(days=days)
    await db.flush()


async def _scan(client: AsyncClient, image: bytes, headers: dict | None = None):
    response = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image), "image/jpeg")},
        headers=headers or {},
    )
    assert response.status_code == 200, response.text
    return response


async def _model_of(db: AsyncSession, response) -> str | None:
    receipt = await db.get(Receipt, uuid.UUID(response.json()["receipt_id"]))
    assert receipt is not None
    return receipt.extraction_model


# --- AC 2: Premium scans use the Premium model, free scans the default ---


async def test_a_premium_scan_is_read_by_the_premium_model(
    client, db_session, test_image_bytes, default_extractor, premium_extractor
):
    await _set_premium(db_session, True)

    response = await _scan(client, test_image_bytes)

    assert premium_extractor.calls == 1
    assert default_extractor.calls == 0
    assert await _model_of(db_session, response) == PREMIUM_MODEL


async def test_a_free_scan_is_read_by_the_default_model(
    client, db_session, test_image_bytes, default_extractor, premium_extractor
):
    response = await _scan(client, test_image_bytes)

    assert premium_extractor.calls == 0
    assert default_extractor.calls == 1
    assert await _model_of(db_session, response) == "default-provider/default-model"


async def test_the_app_cannot_ask_for_the_premium_model(
    client, db_session, test_image_bytes, default_extractor, premium_extractor
):
    """Only the server's entitlement counts; nothing the app sends."""
    response = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        data={"source": "camera", "tier": "priority", "is_premium": "true"},
        headers={"X-Premium": "true"},
    )

    assert response.status_code == 200
    assert premium_extractor.calls == 0
    assert await _model_of(db_session, response) == "default-provider/default-model"


async def test_a_lapsed_premium_scan_uses_the_default_model(
    client, db_session, test_image_bytes, default_extractor, premium_extractor
):
    """EC-PREM 3: Premium is read when extraction starts, expiry included."""
    await _set_premium(db_session, True, days=-1)

    await _scan(client, test_image_bytes)

    assert premium_extractor.calls == 0
    assert default_extractor.calls == 1


async def test_premium_is_read_when_each_extraction_starts(
    client, db_session, test_image_bytes, default_extractor, premium_extractor
):
    """EC-PREM 3: an upgrade, then a lapse, change the very next scan."""
    await _scan(client, test_image_bytes)
    await _set_premium(db_session, True)
    await _scan(client, test_image_bytes)
    await _set_premium(db_session, False)
    await _scan(client, test_image_bytes)

    assert (default_extractor.calls, premium_extractor.calls) == (2, 1)


async def test_without_a_premium_model_premium_scans_use_the_default(
    client, db_session, test_image_bytes, default_extractor
):
    """AC 1: unset, Premium scans use the default model."""
    await _set_premium(db_session, True)

    response = await _scan(client, test_image_bytes)

    assert default_extractor.calls == 1
    assert await _model_of(db_session, response) == "default-provider/default-model"


async def test_the_real_dependency_is_off_when_the_setting_is_unset():
    assert get_premium_receipt_extractor() is None


# --- AC 4: a Premium model failure falls back to the default model ---


@pytest.mark.parametrize(
    "error",
    [
        ExtractionUnavailableError("ServiceUnavailableError"),
        ExtractionUnavailableError("ValidationError"),
        RuntimeError("unexpected"),
    ],
    ids=["unavailable", "invalid-output", "unexpected-error"],
)
async def test_a_failed_premium_model_hands_the_scan_to_the_default(
    client, db_session, test_image_bytes, default_extractor, events, error
):
    from main import app

    failing = _FailingExtractor(PREMIUM_MODEL, error)
    app.dependency_overrides[get_premium_receipt_extractor] = lambda: failing
    await _set_premium(db_session, True)

    response = await _scan(client, test_image_bytes)

    assert failing.calls == 1
    assert default_extractor.calls == 1
    assert await _model_of(db_session, response) == "default-provider/default-model"
    [completed] = await events()
    assert completed["extraction_tier"] == "standard"


async def test_when_both_models_fail_the_scan_fails_as_any_scan_does(
    client, db_session, test_image_bytes
):
    """Then the usual path: 503, the app keeps the photo and retries it, and
    manual entry stays open. Category assignment keeps its rule-based fallback."""
    from main import app

    premium = _FailingExtractor(PREMIUM_MODEL, ExtractionUnavailableError("down"))
    default = _FailingExtractor("default", ExtractionUnavailableError("down"))
    app.dependency_overrides[get_premium_receipt_extractor] = lambda: premium
    app.dependency_overrides[get_receipt_extractor] = lambda: default
    await _set_premium(db_session, True)

    response = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )

    assert response.status_code == 503
    assert (premium.calls, default.calls) == (1, 1)


# --- AC 5: receipt_extraction_completed carries extraction_tier ---


async def test_extraction_completed_carries_the_tier(
    client, db_session, test_image_bytes, default_extractor, premium_extractor, events
):
    await _scan(client, test_image_bytes)
    await _set_premium(db_session, True)
    await _scan(client, test_image_bytes)

    tiers = [props["extraction_tier"] for props in await events()]
    assert sorted(tiers) == ["priority", "standard"]
