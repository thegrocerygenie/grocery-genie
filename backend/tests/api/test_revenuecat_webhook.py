"""Premium through RevenueCat (V11-P0, decision D1).

RevenueCat posts every subscription change to POST /api/webhooks/revenuecat
with the Authorization header set in its dashboard. The backend trusts only
that webhook and RevenueCat's REST API, never the app: the entitlement lives
on the user row, and every Premium gate reads it through
``app.core.entitlements.is_premium``.
"""

from __future__ import annotations

import io
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.database import Receipt, RevenueCatEvent, User
from app.services.revenuecat_client import PremiumState, get_revenuecat_client
from tests.conftest import DEV_USER_ID, USER_B_ID, ensure_user

SECRET = "rc-webhook-secret-for-tests"
WEBHOOK = "/api/webhooks/revenuecat"


@pytest.fixture(autouse=True)
def revenuecat_config(monkeypatch) -> Iterator[None]:
    get_settings.cache_clear()
    monkeypatch.setenv("GG_REVENUECAT_WEBHOOK_SECRET", SECRET)
    yield
    get_settings.cache_clear()


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _event(
    type_: str,
    *,
    user_id: uuid.UUID = DEV_USER_ID,
    event_id: str | None = None,
    expires: datetime | None = None,
    at: datetime | None = None,
    entitlement_ids: list[str] | None = None,
    **extra,
) -> dict:
    now = datetime.now(UTC)
    event = {
        "id": event_id or str(uuid.uuid4()),
        "type": type_,
        "app_user_id": str(user_id),
        "original_app_user_id": str(user_id),
        "aliases": [str(user_id)],
        "entitlement_ids": ["premium"] if entitlement_ids is None else entitlement_ids,
        "product_id": "gg_premium_monthly",
        "period_type": "NORMAL",
        "purchased_at_ms": _ms(now),
        "expiration_at_ms": _ms(expires or now + timedelta(days=30)),
        "event_timestamp_ms": _ms(at or now),
        "environment": "SANDBOX",
        "store": "APP_STORE",
    }
    event.update(extra)
    return {"api_version": "1.0", "event": event}


async def _post(client: AsyncClient, body: dict, auth: str | None = f"Bearer {SECRET}"):
    headers = {} if auth is None else {"Authorization": auth}
    return await client.post(WEBHOOK, json=body, headers=headers)


async def _me(client: AsyncClient) -> dict:
    resp = await client.get("/api/users/me")
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _ledger_count(db: AsyncSession) -> int:
    return (
        await db.execute(select(func.count()).select_from(RevenueCatEvent))
    ).scalar_one()


# -- grant, renew, cancel, expire -------------------------------------------


@pytest.mark.asyncio
async def test_free_user_is_not_premium(client):
    me = await _me(client)
    assert me["is_premium"] is False
    assert me["premium_expires_at"] is None


@pytest.mark.asyncio
async def test_initial_purchase_makes_the_user_premium(client):
    expires = datetime.now(UTC) + timedelta(days=30)
    resp = await _post(client, _event("INITIAL_PURCHASE", expires=expires))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"status": "applied"}

    me = await _me(client)
    assert me["is_premium"] is True
    got = datetime.fromisoformat(me["premium_expires_at"])
    assert abs((got - expires).total_seconds()) < 1


@pytest.mark.asyncio
async def test_renewal_moves_the_expiry(client):
    now = datetime.now(UTC)
    await _post(
        client,
        _event("INITIAL_PURCHASE", expires=now + timedelta(days=1), at=now),
    )
    later = now + timedelta(days=31)
    resp = await _post(
        client,
        _event("RENEWAL", expires=later, at=now + timedelta(seconds=5)),
    )
    assert resp.json() == {"status": "applied"}
    me = await _me(client)
    assert me["is_premium"] is True
    got = datetime.fromisoformat(me["premium_expires_at"])
    assert abs((got - later).total_seconds()) < 1


@pytest.mark.asyncio
async def test_cancellation_keeps_premium_until_the_period_ends(client):
    now = datetime.now(UTC)
    await _post(client, _event("INITIAL_PURCHASE", at=now))
    resp = await _post(
        client,
        _event(
            "CANCELLATION",
            expires=now + timedelta(days=10),
            at=now + timedelta(seconds=5),
            cancel_reason="UNSUBSCRIBE",
        ),
    )
    assert resp.json() == {"status": "applied"}
    assert (await _me(client))["is_premium"] is True


@pytest.mark.asyncio
async def test_refund_cancellation_ends_premium_now(client):
    """A refund (cancel_reason CUSTOMER_SUPPORT) carries an expiry in the past."""
    now = datetime.now(UTC)
    await _post(client, _event("INITIAL_PURCHASE", at=now))
    await _post(
        client,
        _event(
            "CANCELLATION",
            expires=now - timedelta(seconds=1),
            at=now + timedelta(seconds=5),
            cancel_reason="CUSTOMER_SUPPORT",
        ),
    )
    assert (await _me(client))["is_premium"] is False


@pytest.mark.asyncio
async def test_expiration_ends_premium(client):
    now = datetime.now(UTC)
    await _post(client, _event("INITIAL_PURCHASE", at=now))
    resp = await _post(
        client,
        _event("EXPIRATION", expires=now, at=now + timedelta(seconds=5)),
    )
    assert resp.json() == {"status": "applied"}
    me = await _me(client)
    assert me["is_premium"] is False


@pytest.mark.asyncio
async def test_premium_lapses_at_expiry_without_an_expiration_event(client, db_session):
    """A missed EXPIRATION webhook cannot leave a user Premium forever."""
    now = datetime.now(UTC)
    await _post(
        client,
        _event("INITIAL_PURCHASE", expires=now - timedelta(minutes=1), at=now),
    )
    assert (await _me(client))["is_premium"] is False


@pytest.mark.asyncio
async def test_uncancellation_restores_premium(client):
    now = datetime.now(UTC)
    await _post(client, _event("INITIAL_PURCHASE", at=now))
    await _post(
        client,
        _event("EXPIRATION", expires=now, at=now + timedelta(seconds=1)),
    )
    await _post(
        client,
        _event("UNCANCELLATION", at=now + timedelta(seconds=2)),
    )
    assert (await _me(client))["is_premium"] is True


# -- idempotency and ordering ------------------------------------------------


@pytest.mark.asyncio
async def test_replayed_event_id_is_a_no_op(client, db_session):
    now = datetime.now(UTC)
    grant = _event("INITIAL_PURCHASE", event_id="evt-grant-1", at=now)
    expire = _event(
        "EXPIRATION", event_id="evt-expire-1", expires=now, at=now + timedelta(1)
    )
    assert (await _post(client, grant)).json() == {"status": "applied"}
    assert (await _post(client, expire)).json() == {"status": "applied"}
    assert (await _me(client))["is_premium"] is False

    # RevenueCat retries a delivery it thinks failed: same id, same body.
    resp = await _post(client, grant)
    assert resp.status_code == 200
    assert resp.json() == {"status": "duplicate"}
    assert (await _me(client))["is_premium"] is False
    assert await _ledger_count(db_session) == 2


@pytest.mark.asyncio
async def test_an_older_event_arriving_late_changes_nothing(client):
    """Webhooks can arrive out of order: the newest event_timestamp wins."""
    now = datetime.now(UTC)
    await _post(
        client,
        _event("EXPIRATION", expires=now, at=now + timedelta(minutes=5)),
    )
    resp = await _post(client, _event("RENEWAL", at=now))
    assert resp.json() == {"status": "stale"}
    assert (await _me(client))["is_premium"] is False


# -- auth --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bad_secret_is_rejected(client, db_session):
    resp = await _post(client, _event("INITIAL_PURCHASE"), auth="Bearer wrong")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "invalid_webhook_secret"
    assert (await _me(client))["is_premium"] is False
    assert await _ledger_count(db_session) == 0


@pytest.mark.asyncio
async def test_missing_authorization_is_rejected(client):
    resp = await _post(client, _event("INITIAL_PURCHASE"), auth=None)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_secret_without_bearer_prefix_is_accepted(client):
    """RevenueCat sends the header value exactly as typed in its dashboard."""
    resp = await _post(client, _event("INITIAL_PURCHASE"), auth=SECRET)
    assert resp.status_code == 200
    assert (await _me(client))["is_premium"] is True


@pytest.mark.asyncio
async def test_webhook_is_closed_when_no_secret_is_configured(client, monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("GG_REVENUECAT_WEBHOOK_SECRET", "")
    resp = await _post(client, _event("INITIAL_PURCHASE"), auth="Bearer ")
    assert resp.status_code == 401
    resp = await _post(client, _event("INITIAL_PURCHASE"), auth="")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_app_cannot_make_itself_premium(client):
    """The signed-in user's own token is not the webhook secret."""
    resp = await client.post(
        WEBHOOK,
        json=_event("INITIAL_PURCHASE"),
        headers={"Authorization": "Bearer some-user-access-token"},
    )
    assert resp.status_code == 401
    resp = await client.patch("/api/users/me", json={"is_premium": True})
    assert (await _me(client))["is_premium"] is False


# -- events that change nothing ----------------------------------------------


@pytest.mark.asyncio
async def test_unknown_app_user_is_acknowledged_and_ignored(client, db_session):
    resp = await _post(client, _event("INITIAL_PURCHASE", user_id=uuid.uuid4()))
    assert resp.status_code == 200
    assert resp.json() == {"status": "unknown_user"}
    assert await _ledger_count(db_session) == 1


@pytest.mark.asyncio
async def test_anonymous_app_user_id_resolves_through_aliases(client):
    """A purchase before logIn has a $RCAnonymousID; the alias names our user."""
    body = _event("INITIAL_PURCHASE")
    body["event"]["app_user_id"] = "$RCAnonymousID:abc123"
    body["event"]["original_app_user_id"] = "$RCAnonymousID:abc123"
    body["event"]["aliases"] = ["$RCAnonymousID:abc123", str(DEV_USER_ID)]
    resp = await _post(client, body)
    assert resp.json() == {"status": "applied"}
    assert (await _me(client))["is_premium"] is True


@pytest.mark.asyncio
async def test_other_entitlement_is_ignored(client):
    resp = await _post(
        client, _event("INITIAL_PURCHASE", entitlement_ids=["something_else"])
    )
    assert resp.json() == {"status": "ignored"}
    assert (await _me(client))["is_premium"] is False


@pytest.mark.asyncio
async def test_test_event_is_acknowledged(client):
    """The dashboard's "Send test event" button."""
    resp = await _post(client, _event("TEST"))
    assert resp.status_code == 200
    assert resp.json() == {"status": "ignored"}
    assert (await _me(client))["is_premium"] is False


@pytest.mark.asyncio
async def test_malformed_body_is_422(client):
    resp = await _post(client, {"api_version": "1.0", "event": {"type": "RENEWAL"}})
    assert resp.status_code == 422


# -- transfer ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_revokes_premium_from_the_old_user(client, db_session):
    now = datetime.now(UTC)
    await _post(client, _event("INITIAL_PURCHASE", at=now))
    await ensure_user(db_session, USER_B_ID)
    body = _event("TRANSFER", at=now + timedelta(seconds=5))
    body["event"]["transferred_from"] = [str(DEV_USER_ID)]
    body["event"]["transferred_to"] = [str(USER_B_ID)]
    body["event"]["app_user_id"] = str(USER_B_ID)
    resp = await _post(client, body)
    assert resp.status_code == 200
    assert (await _me(client))["is_premium"] is False


@pytest.mark.asyncio
async def test_transfer_refreshes_the_new_user_from_the_rest_api(
    client, db_session, fake_revenuecat
):
    now = datetime.now(UTC)
    await ensure_user(db_session, USER_B_ID)
    fake_revenuecat.states[str(USER_B_ID)] = PremiumState(
        active=True, expires_at=now + timedelta(days=20), product_id="gg_premium"
    )
    body = _event("TRANSFER", at=now)
    body["event"]["transferred_from"] = [str(DEV_USER_ID)]
    body["event"]["transferred_to"] = [str(USER_B_ID)]
    resp = await _post(client, body)
    assert resp.status_code == 200
    user_b = await db_session.get(User, USER_B_ID)
    await db_session.refresh(user_b)
    from app.core.entitlements import is_premium

    assert is_premium(user_b) is True


# -- the REST API refresh (after a purchase or restore in the app) ------------


class FakeRevenueCat:
    def __init__(self) -> None:
        self.states: dict[str, PremiumState] = {}
        self.calls: list[str] = []
        self.fail = False

    async def get_premium(self, app_user_id: str) -> PremiumState:
        self.calls.append(app_user_id)
        if self.fail:
            from app.services.revenuecat_client import RevenueCatUnavailableError

            raise RevenueCatUnavailableError("down")
        return self.states.get(app_user_id, PremiumState(active=False))


@pytest.fixture
def fake_revenuecat(client) -> FakeRevenueCat:
    from main import app

    fake = FakeRevenueCat()
    app.dependency_overrides[get_revenuecat_client] = lambda: fake
    return fake


@pytest.mark.asyncio
async def test_refresh_reads_revenuecat_not_the_app(client, fake_revenuecat):
    expires = datetime.now(UTC) + timedelta(days=30)
    fake_revenuecat.states[str(DEV_USER_ID)] = PremiumState(
        active=True, expires_at=expires, product_id="gg_premium_monthly"
    )
    # Whatever the app claims in the body is ignored.
    resp = await client.post(
        "/api/users/me/premium/refresh", json={"is_premium": False}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_premium"] is True
    assert fake_revenuecat.calls == [str(DEV_USER_ID)]
    assert (await _me(client))["is_premium"] is True


@pytest.mark.asyncio
async def test_refresh_revokes_when_revenuecat_says_inactive(client, fake_revenuecat):
    await _post(client, _event("INITIAL_PURCHASE"))
    resp = await client.post("/api/users/me/premium/refresh")
    assert resp.json()["is_premium"] is False


@pytest.mark.asyncio
async def test_refresh_when_revenuecat_is_down_keeps_the_stored_state(
    client, fake_revenuecat
):
    await _post(client, _event("INITIAL_PURCHASE"))
    fake_revenuecat.fail = True
    resp = await client.post("/api/users/me/premium/refresh")
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "revenuecat_unavailable"
    assert (await _me(client))["is_premium"] is True


@pytest.mark.asyncio
async def test_refresh_without_an_api_key_is_503(client):
    resp = await client.post("/api/users/me/premium/refresh")
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "revenuecat_unavailable"


# -- what Premium unlocks ----------------------------------------------------


@pytest.mark.asyncio
async def test_premium_unlocks_the_12_month_trend(client):
    resp = await client.get("/api/dashboard/spending?months=12")
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "premium_required"

    await _post(client, _event("INITIAL_PURCHASE"))
    resp = await client.get("/api/dashboard/spending?months=12")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["trend"]) == 12


async def _seed_receipts_this_month(db: AsyncSession, count: int) -> None:
    now = datetime.now(UTC)
    for i in range(count):
        r = Receipt(
            user_id=DEV_USER_ID,
            date=now.date(),
            status="confirmed",
            currency="USD",
            total=10.0,
        )
        r.created_at = now - timedelta(minutes=i)
        db.add(r)
    await db.commit()


@pytest.mark.asyncio
async def test_premium_user_scans_past_the_free_quota(
    client, db_session, test_image_bytes
):
    await _seed_receipts_this_month(db_session, 20)
    files = {"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")}
    resp = await client.post("/api/receipts/scan", files=files)
    assert resp.status_code == 429

    await _post(client, _event("INITIAL_PURCHASE"))
    files = {"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")}
    resp = await client.post("/api/receipts/scan", files=files)
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_status_change_emits_analytics(client):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app
    from tests.api.test_analytics import SpyBackend

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    now = datetime.now(UTC)
    await _post(client, _event("INITIAL_PURCHASE", at=now))
    await _post(client, _event("RENEWAL", at=now + timedelta(seconds=1)))
    await _post(
        client, _event("EXPIRATION", expires=now, at=now + timedelta(seconds=2))
    )
    changes = [c for c in spy.calls if c[0] == "premium_status_changed"]
    # The renewal kept the user Premium: no change to record.
    assert [(c[1]["is_premium"], c[1]["event_type"]) for c in changes] == [
        (True, "INITIAL_PURCHASE"),
        (False, "EXPIRATION"),
    ]
    assert all(c[2] == DEV_USER_ID for c in changes)


@pytest.mark.asyncio
async def test_auth_me_carries_premium_too(client):
    """The app reads the profile from /api/auth/me."""
    resp = await client.get("/api/auth/me")
    assert resp.json()["is_premium"] is False
    await _post(client, _event("INITIAL_PURCHASE"))
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["is_premium"] is True
    assert resp.json()["premium_expires_at"] is not None
