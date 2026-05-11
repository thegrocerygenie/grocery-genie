"""Free-tier monthly receipt quota tests.

Overview constraint (docs/prd/00-overview.md): Free tier = 20 receipts/month.
"""

import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.database import Receipt
from tests.conftest import DEV_USER_ID


async def _scan(client: AsyncClient, image_bytes: bytes):
    return await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
    )


async def _seed_receipts_this_month(
    db_session: AsyncSession, count: int, user_id: uuid.UUID = DEV_USER_ID
) -> None:
    """Seed `count` receipts created this calendar month."""
    now = datetime.now(UTC)
    for i in range(count):
        r = Receipt(
            user_id=user_id,
            date=now.date(),
            status="confirmed",
            currency="USD",
            total=10.0,
        )
        r.created_at = now - timedelta(minutes=i)
        db_session.add(r)
    await db_session.commit()


@pytest.mark.asyncio
async def test_scan_allowed_under_quota(
    client: AsyncClient, test_image_bytes: bytes, db_session: AsyncSession
):
    """At 19 scanned receipts this month, the 20th scan still succeeds."""
    assert get_settings().free_tier_receipts_per_month == 20
    await _seed_receipts_this_month(db_session, 19)

    resp = await _scan(client, test_image_bytes)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_scan_blocked_at_quota(
    client: AsyncClient, test_image_bytes: bytes, db_session: AsyncSession
):
    """At 20 scanned receipts this month, the 21st scan is rejected with 429."""
    await _seed_receipts_this_month(db_session, 20)

    resp = await _scan(client, test_image_bytes)
    assert resp.status_code == 429
    assert "quota" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_scan_prior_month_does_not_count(
    client: AsyncClient, test_image_bytes: bytes, db_session: AsyncSession
):
    """Receipts scanned in a prior calendar month don't count against current quota."""
    # Seed 25 receipts from a previous month
    last_month = (datetime.now(UTC).replace(day=1) - timedelta(days=1)).replace(hour=12)
    for i in range(25):
        r = Receipt(
            user_id=DEV_USER_ID,
            date=last_month.date(),
            status="confirmed",
            currency="USD",
            total=10.0,
        )
        r.created_at = last_month - timedelta(minutes=i)
        db_session.add(r)
    await db_session.commit()

    resp = await _scan(client, test_image_bytes)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_quota_disabled_when_setting_zero(
    client: AsyncClient, test_image_bytes: bytes, db_session: AsyncSession, monkeypatch
):
    """Setting free_tier_receipts_per_month=0 disables the quota (premium tier)."""
    await _seed_receipts_this_month(db_session, 20)

    get_settings.cache_clear()
    monkeypatch.setenv("GG_FREE_TIER_RECEIPTS_PER_MONTH", "0")
    try:
        resp = await _scan(client, test_image_bytes)
        assert resp.status_code == 200
    finally:
        get_settings.cache_clear()
