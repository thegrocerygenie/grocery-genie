"""RevenueCat's REST API: the server-side read of a subscriber's entitlement.

The backend asks RevenueCat, never the app, whether a user is Premium
(decision D1). This client reads ``GET /v1/subscribers/{app_user_id}`` with the
secret API key. Tests replace it through ``get_revenuecat_client``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError

from app.core import clock
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class PremiumState(BaseModel):
    """What RevenueCat says about the Premium entitlement for one user."""

    active: bool
    expires_at: datetime | None = None
    product_id: str | None = None
    # When RevenueCat answered (its own clock, like webhook event times). The
    # refresh is stamped with it, so it never overwrites a newer webhook.
    read_at: datetime | None = None


class RevenueCatUnavailableError(Exception):
    """RevenueCat could not be read (not configured, unreachable, or a bad
    answer). The stored entitlement is left as it was."""


class RevenueCatClient(Protocol):
    async def get_premium(self, app_user_id: str) -> PremiumState: ...


class _Entitlement(BaseModel):
    expires_date: datetime | None = None
    grace_period_expires_date: datetime | None = None
    product_identifier: str | None = None


class _Subscriber(BaseModel):
    entitlements: dict[str, _Entitlement] = {}


class _SubscriberResponse(BaseModel):
    request_date_ms: int | None = None
    subscriber: _Subscriber


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class HttpRevenueCatClient:
    def __init__(
        self,
        api_key: str,
        entitlement_id: str,
        base_url: str = "https://api.revenuecat.com",
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key
        self.entitlement_id = entitlement_id
        self.base_url = base_url.rstrip("/")
        self.http = http

    async def _get(self, url: str) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if self.http is not None:
            return await self.http.get(url, headers=headers)
        async with httpx.AsyncClient(timeout=10.0) as http:
            return await http.get(url, headers=headers)

    async def get_premium(self, app_user_id: str) -> PremiumState:
        url = f"{self.base_url}/v1/subscribers/{quote(app_user_id, safe='')}"
        try:
            resp = await self._get(url)
            resp.raise_for_status()
            body = _SubscriberResponse.model_validate(resp.json())
        except (httpx.HTTPError, ValueError, ValidationError) as e:
            logger.warning("revenuecat subscriber read failed: %s", type(e).__name__)
            raise RevenueCatUnavailableError(str(e)) from e

        read_at = (
            None
            if body.request_date_ms is None
            else datetime.fromtimestamp(body.request_date_ms / 1000, tz=UTC)
        )
        entitlement = body.subscriber.entitlements.get(self.entitlement_id)
        if entitlement is None:
            return PremiumState(active=False, read_at=read_at)
        # No expiry: a grant that does not lapse. A grace period (billing
        # retry) keeps the entitlement past the paid period.
        expires = _utc(entitlement.expires_date)
        grace = _utc(entitlement.grace_period_expires_date)
        if expires is not None and grace is not None:
            expires = max(expires, grace)
        active = expires is None or expires > clock.now()
        return PremiumState(
            active=active,
            expires_at=expires,
            product_id=entitlement.product_identifier,
            read_at=read_at,
        )


def get_revenuecat_client() -> RevenueCatClient | None:
    """The REST client, or None when no API key is configured."""
    settings = get_settings()
    if not settings.revenuecat_api_key:
        return None
    return HttpRevenueCatClient(
        api_key=settings.revenuecat_api_key,
        entitlement_id=settings.revenuecat_entitlement_id,
        base_url=settings.revenuecat_api_base,
    )
