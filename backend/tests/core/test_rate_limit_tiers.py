"""Rate limit tiers per user (NFR 7: 50 receipt submissions/hour, 300 reads/minute).

Each test runs a bare app behind RateLimitMiddleware with the memory store and
small limits, so a 429 takes a few requests instead of hundreds.
"""

import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core import rate_limit
from app.core.config import Settings
from app.core.rate_limit import RateLimitMiddleware, reset_ip_state
from app.core.security import create_token

SUBMISSIONS_PER_HOUR = 2
REQUESTS_PER_MINUTE = 3


@pytest.fixture(autouse=True)
def small_limits(monkeypatch):
    settings = Settings(
        _env_file=None,
        rate_limit_storage="memory",
        max_receipt_submissions_per_hour=SUBMISSIONS_PER_HOUR,
        max_reads_per_minute=REQUESTS_PER_MINUTE,
    )
    monkeypatch.setattr(rate_limit, "get_settings", lambda: settings)
    reset_ip_state()
    yield
    reset_ip_state()


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.post("/api/receipts/scan")
    async def scan() -> dict:
        return {"ok": True}

    @app.post("/api/receipts")
    async def manual() -> dict:
        return {"ok": True}

    @app.patch("/api/receipts/{receipt_id}")
    async def update(receipt_id: str) -> dict:
        return {"ok": True}

    @app.post("/api/analytics/events")
    async def analytics() -> dict:
        return {"ok": True}

    @app.get("/api/receipts")
    async def list_receipts() -> dict:
        return {"ok": True}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


def _auth(user_id: uuid.UUID) -> dict[str, str]:
    """A fresh access token for user_id: each call is a new sign-in."""
    token, _ = create_token(user_id=user_id, typ="access")
    return {"Authorization": f"Bearer {token}"}


async def _statuses(client, method: str, path: str, headers, times: int) -> list[int]:
    return [
        (await client.request(method, path, headers=headers)).status_code
        for _ in range(times)
    ]


# --- Receipt submissions: 50/hour per user ---


async def test_scans_past_the_hourly_limit_get_429(client):
    headers = _auth(uuid.uuid4())

    statuses = await _statuses(client, "POST", "/api/receipts/scan", headers, 3)

    assert statuses == [200, 200, 429]


async def test_the_submission_429_says_when_to_retry(client):
    headers = _auth(uuid.uuid4())
    await _statuses(client, "POST", "/api/receipts/scan", headers, 2)

    response = await client.post("/api/receipts/scan", headers=headers)

    assert response.status_code == 429
    assert response.headers["Retry-After"]


async def test_manual_receipts_share_the_submission_limit(client):
    headers = _auth(uuid.uuid4())
    await _statuses(client, "POST", "/api/receipts/scan", headers, 2)

    response = await client.post("/api/receipts", headers=headers)

    assert response.status_code == 429


async def test_signing_in_again_does_not_reset_the_submission_count(client):
    user_id = uuid.uuid4()
    await _statuses(client, "POST", "/api/receipts/scan", _auth(user_id), 2)

    response = await client.post("/api/receipts/scan", headers=_auth(user_id))

    assert response.status_code == 429


async def test_users_have_separate_submission_counts(client):
    await _statuses(client, "POST", "/api/receipts/scan", _auth(uuid.uuid4()), 2)

    response = await client.post("/api/receipts/scan", headers=_auth(uuid.uuid4()))

    assert response.status_code == 200


async def test_other_writes_do_not_use_the_submission_allowance(client):
    headers = _auth(uuid.uuid4())
    await client.post("/api/analytics/events", headers=headers)
    await client.patch(f"/api/receipts/{uuid.uuid4()}", headers=headers)

    statuses = await _statuses(client, "POST", "/api/receipts/scan", headers, 2)

    assert statuses == [200, 200]


# --- Everything else: 300/minute per user ---


async def test_reads_past_the_per_minute_limit_get_429(client):
    headers = _auth(uuid.uuid4())

    statuses = await _statuses(client, "GET", "/api/receipts", headers, 4)

    assert statuses == [200, 200, 200, 429]


async def test_other_writes_count_toward_the_per_minute_limit(client):
    headers = _auth(uuid.uuid4())
    await _statuses(client, "POST", "/api/analytics/events", headers, 3)

    response = await client.get("/api/receipts", headers=headers)

    assert response.status_code == 429


async def test_signing_in_again_does_not_reset_the_per_minute_count(client):
    user_id = uuid.uuid4()
    await _statuses(client, "GET", "/api/receipts", _auth(user_id), 3)

    response = await client.get("/api/receipts", headers=_auth(user_id))

    assert response.status_code == 429


async def test_a_token_that_is_not_a_jwt_is_limited_on_its_own(client):
    """The debug api_token is not a JWT: it keeps a count of its own."""
    headers = {"Authorization": "Bearer static-dev-token"}

    statuses = await _statuses(client, "GET", "/api/receipts", headers, 4)

    assert statuses == [200, 200, 200, 429]
