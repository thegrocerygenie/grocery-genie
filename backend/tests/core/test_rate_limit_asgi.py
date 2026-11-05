"""RateLimitMiddleware is plain ASGI: the app behind it gets the server's own
``receive``, so a route sees its client disconnect.

A Starlette ``BaseHTTPMiddleware`` wraps ``receive`` in a task group, and
``request.is_disconnected()`` polls inside a cancelled scope, so every poll is
cancelled and the ``http.disconnect`` message is lost. The export build stops
on that check (tests/api/test_data_export_disconnect.py).
"""

import pytest
from fastapi import FastAPI, Request

from app.core.rate_limit import RateLimitMiddleware, reset_ip_state
from app.core.security import create_token
from tests.conftest import DEV_USER_ID


@pytest.fixture(autouse=True)
def _fresh_counts():
    reset_ip_state()
    yield
    reset_ip_state()


def _scope(method: str, path: str, headers: list[tuple[bytes, bytes]]) -> dict:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"test"), *headers],
        "client": ("203.0.113.7", 50000),
        "server": ("test", 80),
    }


def _bearer() -> list[tuple[bytes, bytes]]:
    token, _ = create_token(user_id=DEV_USER_ID, typ="access")
    return [(b"authorization", f"Bearer {token}".encode())]


@pytest.mark.parametrize(
    ("method", "path", "signed_in"),
    [
        ("GET", "/health", False),  # never counted
        ("GET", "/api/users/me/export", True),  # counted per user
        ("POST", "/api/auth/sign-in", False),  # counted per IP
    ],
)
async def test_a_route_behind_the_middleware_sees_its_client_disconnect(
    method, path, signed_in
):
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    seen: list[bool] = []

    @app.api_route(path, methods=[method])
    async def probe(request: Request) -> dict:
        seen.append(await request.is_disconnected())
        return {}

    async def receive() -> dict:
        return {"type": "http.disconnect"}  # the client has gone

    sent: list[dict] = []

    async def send(message: dict) -> None:
        sent.append(message)

    headers = _bearer() if signed_in else []
    await app(_scope(method, path, headers), receive, send)

    assert sent[0]["status"] == 200
    assert seen == [True]


async def test_lifespan_and_websocket_scopes_pass_through_untouched():
    reached: list[dict] = []

    async def inner(scope, receive, send) -> None:
        reached.append(scope)

    middleware = RateLimitMiddleware(inner)

    async def receive() -> dict:
        return {}

    async def send(message: dict) -> None:
        pass

    lifespan = {"type": "lifespan", "asgi": {"version": "3.0"}}
    websocket = _scope("GET", "/ws", []) | {"type": "websocket"}
    await middleware(lifespan, receive, send)
    await middleware(websocket, receive, send)

    assert reached == [lifespan, websocket]
