"""revoke_apple_grant: exchange a fresh authorization code, check it is the
account's Apple ID, then revoke the grant at Apple (TN3194)."""

from __future__ import annotations

import httpx
import pytest

from app.services import apple_auth


@pytest.fixture
def apple(monkeypatch):
    """Stub the exchange and the id_token check; capture what reaches /auth/revoke."""
    state: dict = {
        "exchange": {"access_token": "at", "refresh_token": "rt", "id_token": "jwt"},
        "sub": "apple-sub-1",
        "revoke_status": 200,
        "revoked": [],
    }

    async def _exchange(code: str) -> dict:
        state["code"] = code
        return state["exchange"]

    async def _decode(token: str) -> dict:
        return {"sub": state["sub"]}

    def _handler(request: httpx.Request) -> httpx.Response:
        state["revoked"].append((str(request.url), request.content.decode()))
        return httpx.Response(state["revoke_status"])

    real_client = httpx.AsyncClient

    def _client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(_handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(apple_auth, "_exchange_authorization_code", _exchange)
    monkeypatch.setattr(apple_auth, "_decode_apple_jwt", _decode)
    monkeypatch.setattr(apple_auth, "_build_client_secret", lambda: "secret")
    monkeypatch.setattr(apple_auth.httpx, "AsyncClient", _client)
    return state


async def test_revokes_the_refresh_token(apple):
    await apple_auth.revoke_apple_grant(
        authorization_code="code-1", expected_sub="apple-sub-1"
    )

    assert apple["code"] == "code-1"
    [(url, body)] = apple["revoked"]
    assert url == "https://appleid.apple.com/auth/revoke"
    assert "token=rt" in body
    assert "token_type_hint=refresh_token" in body
    assert "client_secret=secret" in body


async def test_falls_back_to_the_access_token(apple):
    apple["exchange"] = {"access_token": "at", "id_token": "jwt"}

    await apple_auth.revoke_apple_grant(
        authorization_code="code-1", expected_sub="apple-sub-1"
    )

    [(_, body)] = apple["revoked"]
    assert "token=at" in body
    assert "token_type_hint=access_token" in body


async def test_other_apple_id_is_refused_and_not_revoked(apple):
    apple["sub"] = "someone-else"

    with pytest.raises(apple_auth.AppleAccountMismatch):
        await apple_auth.revoke_apple_grant(
            authorization_code="code-1", expected_sub="apple-sub-1"
        )
    assert apple["revoked"] == []


async def test_apple_error_raises(apple):
    apple["revoke_status"] = 400

    with pytest.raises(ValueError, match="revoke"):
        await apple_auth.revoke_apple_grant(
            authorization_code="code-1", expected_sub="apple-sub-1"
        )


async def test_network_error_raises_value_error(apple, monkeypatch):
    def _down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("apple unreachable")

    real_client = httpx._client.AsyncClient  # the fixture patched httpx.AsyncClient

    def _client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(_down)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(apple_auth.httpx, "AsyncClient", _client)

    with pytest.raises(ValueError, match="unreachable"):
        await apple_auth.revoke_apple_grant(
            authorization_code="code-1", expected_sub="apple-sub-1"
        )
