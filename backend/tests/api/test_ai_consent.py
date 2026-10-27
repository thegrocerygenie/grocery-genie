"""Consent to send receipts to third-party AI (App Store 5.1.2(i)).

Scanning sends the receipt photo, and the item names on it, to Anthropic.
The server keeps the user's consent (when, and which policy version) and
refuses a scan without consent for the current version. Manual receipts
send nothing to the AI, so they work without consent.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.database import User
from app.services.ai_consent import AI_CONSENT_POLICY_VERSION

NO_CONSENT_USER_ID = uuid.UUID("00000000-0000-0000-0000-0000000000c0")


@pytest.fixture
async def user_without_consent(db_session) -> User:
    user = User(
        id=NO_CONSENT_USER_ID,
        email="noconsent@test.com",
        name="No Consent",
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def no_consent_client(
    db_session, mock_extractor, user_without_consent
) -> AsyncGenerator[AsyncClient, None]:
    from main import app
    from tests.conftest import _create_test_client

    _create_test_client(app, db_session, mock_extractor, user_without_consent)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


async def _scan(client: AsyncClient, image: bytes):
    return await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", image, "image/jpeg")},
    )


def _assert_consent_required(response) -> None:
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "ai_consent_required"
    assert detail["policy_version"] == AI_CONSENT_POLICY_VERSION
    assert "Anthropic" in detail["message"]


async def test_scan_without_consent_is_refused(
    no_consent_client, test_image_bytes, mock_extractor, monkeypatch
):
    calls: list[int] = []
    real_extract = mock_extractor.extract

    async def spy(image_data: bytes, content_type: str):
        calls.append(1)
        return await real_extract(image_data, content_type)

    monkeypatch.setattr(mock_extractor, "extract", spy)
    response = await _scan(no_consent_client, test_image_bytes)
    _assert_consent_required(response)
    # Nothing reached the AI.
    assert calls == []


async def test_scan_without_consent_stores_no_receipt(
    no_consent_client, test_image_bytes
):
    await _scan(no_consent_client, test_image_bytes)
    listing = await no_consent_client.get("/api/receipts")
    assert listing.status_code == 200
    assert listing.json()["total"] == 0


async def test_profile_reports_no_consent(no_consent_client):
    response = await no_consent_client.get("/api/users/me")
    consent = response.json()["ai_consent"]
    assert consent == {
        "granted": False,
        "granted_at": None,
        "policy_version": None,
        "current_policy_version": AI_CONSENT_POLICY_VERSION,
    }


async def test_grant_consent_records_time_and_version(
    no_consent_client, user_without_consent
):
    before = datetime.now(UTC)
    response = await no_consent_client.put(
        "/api/users/me/ai-consent",
        json={"policy_version": AI_CONSENT_POLICY_VERSION},
    )
    assert response.status_code == 200
    consent = response.json()["ai_consent"]
    assert consent["granted"] is True
    assert consent["policy_version"] == AI_CONSENT_POLICY_VERSION
    granted_at = datetime.fromisoformat(consent["granted_at"])
    if granted_at.tzinfo is None:
        granted_at = granted_at.replace(tzinfo=UTC)
    assert granted_at >= before.replace(microsecond=0)
    assert user_without_consent.ai_consent_version == AI_CONSENT_POLICY_VERSION
    assert user_without_consent.ai_consent_at is not None


async def test_scan_works_after_consent(no_consent_client, test_image_bytes):
    await no_consent_client.put(
        "/api/users/me/ai-consent",
        json={"policy_version": AI_CONSENT_POLICY_VERSION},
    )
    response = await _scan(no_consent_client, test_image_bytes)
    assert response.status_code == 200


async def test_grant_twice_keeps_first_time(no_consent_client):
    first = await no_consent_client.put(
        "/api/users/me/ai-consent",
        json={"policy_version": AI_CONSENT_POLICY_VERSION},
    )
    second = await no_consent_client.put(
        "/api/users/me/ai-consent",
        json={"policy_version": AI_CONSENT_POLICY_VERSION},
    )
    assert second.status_code == 200
    assert (
        second.json()["ai_consent"]["granted_at"]
        == first.json()["ai_consent"]["granted_at"]
    )


async def test_grant_for_an_old_policy_version_is_refused(
    no_consent_client, user_without_consent
):
    response = await no_consent_client.put(
        "/api/users/me/ai-consent", json={"policy_version": "2000-01-01"}
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "ai_consent_version_mismatch"
    assert detail["current_policy_version"] == AI_CONSENT_POLICY_VERSION
    assert user_without_consent.ai_consent_at is None


async def test_withdraw_consent_blocks_scans_again(no_consent_client, test_image_bytes):
    await no_consent_client.put(
        "/api/users/me/ai-consent",
        json={"policy_version": AI_CONSENT_POLICY_VERSION},
    )
    response = await no_consent_client.delete("/api/users/me/ai-consent")
    assert response.status_code == 200
    assert response.json()["ai_consent"]["granted"] is False

    _assert_consent_required(await _scan(no_consent_client, test_image_bytes))


async def test_withdraw_without_consent_is_a_no_op(no_consent_client):
    response = await no_consent_client.delete("/api/users/me/ai-consent")
    assert response.status_code == 200
    assert response.json()["ai_consent"]["granted"] is False


async def test_consent_for_an_older_version_does_not_count(
    no_consent_client, user_without_consent, test_image_bytes
):
    """A new policy version asks again: consent to old text is not consent."""
    user_without_consent.ai_consent_at = datetime.now(UTC)
    user_without_consent.ai_consent_version = "2000-01-01"

    _assert_consent_required(await _scan(no_consent_client, test_image_bytes))
    me = await no_consent_client.get("/api/users/me")
    assert me.json()["ai_consent"]["granted"] is False
    assert me.json()["ai_consent"]["policy_version"] == "2000-01-01"


async def test_manual_receipt_works_without_consent(no_consent_client):
    response = await no_consent_client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": "2026-10-20",
            "total": 4.5,
            "items": [{"name": "Milk", "unit_price": 4.5, "total_price": 4.5}],
        },
    )
    assert response.status_code == 201


async def test_consent_routes_require_auth():
    from main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        put = await ac.put(
            "/api/users/me/ai-consent",
            json={"policy_version": AI_CONSENT_POLICY_VERSION},
        )
        delete = await ac.delete("/api/users/me/ai-consent")
    assert put.status_code == 401
    assert delete.status_code == 401
