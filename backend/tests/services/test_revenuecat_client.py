"""The RevenueCat REST client reads GET /v1/subscribers/{id} (no network)."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.services.revenuecat_client import (
    HttpRevenueCatClient,
    RevenueCatUnavailableError,
    get_revenuecat_client,
)


def _client(handler) -> HttpRevenueCatClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return HttpRevenueCatClient(api_key="sk_test", entitlement_id="premium", http=http)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.mark.asyncio
async def test_active_entitlement_is_read_with_the_secret_key():
    expires = (datetime.now(UTC) + timedelta(days=30)).replace(microsecond=0)
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "subscriber": {
                    "entitlements": {
                        "premium": {
                            "expires_date": _iso(expires),
                            "product_identifier": "gg_premium_monthly",
                        }
                    }
                }
            },
        )

    state = await _client(handler).get_premium("user/1")
    assert state.active is True
    assert state.expires_at == expires
    assert state.product_id == "gg_premium_monthly"
    assert seen[0].headers["authorization"] == "Bearer sk_test"
    # The app user id is one path segment, escaped.
    assert seen[0].url.raw_path == b"/v1/subscribers/user%2F1"


@pytest.mark.asyncio
async def test_expired_or_missing_entitlement_is_inactive():
    past = datetime.now(UTC) - timedelta(days=1)

    def expired(request):
        return httpx.Response(
            200,
            json={
                "subscriber": {
                    "entitlements": {"premium": {"expires_date": _iso(past)}}
                }
            },
        )

    def missing(request):
        return httpx.Response(200, json={"subscriber": {"entitlements": {}}})

    assert (await _client(expired).get_premium("u")).active is False
    assert (await _client(missing).get_premium("u")).active is False


@pytest.mark.asyncio
async def test_grace_period_keeps_the_entitlement():
    past = datetime.now(UTC) - timedelta(hours=1)
    grace = datetime.now(UTC) + timedelta(days=6)

    def handler(request):
        return httpx.Response(
            200,
            json={
                "subscriber": {
                    "entitlements": {
                        "premium": {
                            "expires_date": _iso(past),
                            "grace_period_expires_date": _iso(grace),
                        }
                    }
                }
            },
        )

    assert (await _client(handler).get_premium("u")).active is True


@pytest.mark.asyncio
async def test_lifetime_entitlement_has_no_expiry():
    def handler(request):
        return httpx.Response(
            200,
            json={"subscriber": {"entitlements": {"premium": {"expires_date": None}}}},
        )

    state = await _client(handler).get_premium("u")
    assert state.active is True
    assert state.expires_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [httpx.Response(500), httpx.Response(200, text="not json"), httpx.Response(200)],
)
async def test_errors_raise_unavailable(response):
    with pytest.raises(RevenueCatUnavailableError):
        await _client(lambda request: response).get_premium("u")


def test_no_api_key_means_no_client(monkeypatch):
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("GG_REVENUECAT_API_KEY", "")
    try:
        assert get_revenuecat_client() is None
        get_settings.cache_clear()
        monkeypatch.setenv("GG_REVENUECAT_API_KEY", "sk_live")
        assert isinstance(get_revenuecat_client(), HttpRevenueCatClient)
    finally:
        get_settings.cache_clear()
