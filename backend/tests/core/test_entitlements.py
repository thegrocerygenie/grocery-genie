from datetime import UTC, datetime, timedelta
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient

from app.core import clock
from app.core.entitlements import is_premium, require_premium
from app.core.security import get_current_user
from app.models.database import User
from tests.conftest import DEV_USER_ID


def _user(**fields) -> User:
    return User(id=DEV_USER_ID, email="a@example.com", **fields)


def test_a_user_with_no_entitlement_is_free():
    assert is_premium(_user()) is False


def test_an_active_entitlement_before_its_expiry_is_premium():
    future = datetime.now(UTC) + timedelta(days=3)
    assert is_premium(_user(premium_active=True, premium_expires_at=future)) is True


def test_an_entitlement_past_its_expiry_is_free(monkeypatch):
    expiry = datetime(2026, 11, 1, tzinfo=UTC)
    user = _user(premium_active=True, premium_expires_at=expiry)
    monkeypatch.setattr(clock, "now", lambda: expiry - timedelta(seconds=1))
    assert is_premium(user) is True
    monkeypatch.setattr(clock, "now", lambda: expiry)
    assert is_premium(user) is False


def test_an_inactive_entitlement_is_free_even_before_expiry():
    future = datetime.now(UTC) + timedelta(days=3)
    assert is_premium(_user(premium_active=False, premium_expires_at=future)) is False


def test_an_active_entitlement_without_expiry_is_premium():
    """A non-renewing (lifetime) grant has no expiry."""
    assert is_premium(_user(premium_active=True, premium_expires_at=None)) is True


def test_a_naive_expiry_from_sqlite_is_read_as_utc():
    future = (datetime.now(UTC) + timedelta(days=1)).replace(tzinfo=None)
    assert is_premium(_user(premium_active=True, premium_expires_at=future)) is True


def _app_for(user: User) -> FastAPI:
    app = FastAPI()

    @app.get("/extra")
    async def extra(
        u: Annotated[User, Depends(require_premium("data_export"))],
    ) -> dict:
        return {"user": str(u.id)}

    app.dependency_overrides[get_current_user] = lambda: user
    return app


@pytest.mark.asyncio
async def test_require_premium_refuses_a_free_user_with_premium_required():
    app = _app_for(_user())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        resp = await c.get("/extra")
    assert resp.status_code == 403
    assert resp.json() == {
        "detail": {
            "code": "premium_required",
            "feature": "data_export",
            "message": "This feature is part of Grocery Genie Premium.",
        }
    }


@pytest.mark.asyncio
async def test_require_premium_lets_a_premium_user_through():
    future = datetime.now(UTC) + timedelta(days=3)
    app = _app_for(_user(premium_active=True, premium_expires_at=future))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        resp = await c.get("/extra")
    assert resp.status_code == 200
    assert resp.json() == {"user": str(DEV_USER_ID)}
