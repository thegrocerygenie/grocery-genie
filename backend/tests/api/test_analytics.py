"""Tests for the client analytics event ingestion endpoint."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import DEV_USER_ID


class SpyBackend:
    """Analytics backend that records emissions for assertion."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict, uuid.UUID]] = []

    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None:
        self.calls.append((event_name, properties, user_id))


@pytest.fixture
def analytics_spy(client):
    """Override get_analytics_service with a spy backend; yields the spy.

    Depends on the `client` fixture so the override is registered after the
    test app is built and cleared by `client`'s teardown.
    """
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    return spy


async def test_ingest_accepted_event_returns_204(client, analytics_spy):
    """An allowlisted event is accepted and forwarded to the analytics backend."""
    resp = await client.post(
        "/api/analytics/events",
        json={"event_name": "receipt_abandoned", "properties": {"stage": "capture"}},
    )
    assert resp.status_code == 204
    assert len(analytics_spy.calls) == 1
    event_name, properties, user_id = analytics_spy.calls[0]
    assert event_name == "receipt_abandoned"
    assert properties == {"stage": "capture"}
    assert user_id == DEV_USER_ID


async def test_ingest_uses_jwt_user_not_body(client, analytics_spy):
    """A user_id smuggled into properties is ignored — the JWT user wins."""
    bogus = uuid.uuid4()
    resp = await client.post(
        "/api/analytics/events",
        json={
            "event_name": "receipt_abandoned",
            "properties": {"stage": "review", "user_id": str(bogus)},
        },
    )
    assert resp.status_code == 204
    _, _, user_id = analytics_spy.calls[0]
    assert user_id == DEV_USER_ID
    assert user_id != bogus


async def test_ingest_rejects_non_allowlisted_event(client, analytics_spy):
    """A server-owned event submitted by a client is rejected, not emitted."""
    resp = await client.post(
        "/api/analytics/events",
        json={"event_name": "budget_created", "properties": {}},
    )
    assert resp.status_code == 422
    assert analytics_spy.calls == []


async def test_ingest_rejects_unknown_event(client, analytics_spy):
    """An unrecognised event name is rejected."""
    resp = await client.post(
        "/api/analytics/events",
        json={"event_name": "garbage_event", "properties": {}},
    )
    assert resp.status_code == 422
    assert analytics_spy.calls == []


async def test_ingest_rejects_missing_event_name(client):
    """A body without event_name fails schema validation."""
    resp = await client.post("/api/analytics/events", json={"properties": {}})
    assert resp.status_code == 422


async def test_ingest_defaults_empty_properties(client, analytics_spy):
    """Omitting properties defaults to an empty dict."""
    resp = await client.post(
        "/api/analytics/events",
        json={"event_name": "receipt_abandoned"},
    )
    assert resp.status_code == 204
    _, properties, _ = analytics_spy.calls[0]
    assert properties == {}


async def test_ingest_requires_auth(db_session):
    """A request with no Authorization header returns 401 (real auth runs)."""
    from app.core.dependencies import get_db
    from main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/api/analytics/events",
                json={"event_name": "receipt_abandoned", "properties": {}},
            )
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()
