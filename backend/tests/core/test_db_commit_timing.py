"""The request transaction commits before the response reaches the client.

A yield dependency with the default "request" scope runs its exit code after
the response is sent. If get_db commits there, a client can act on a 201
before its row exists: sign-up returns tokens, the next GET /api/users/me
reads no user and answers 401 "user not found". The dependency must use
scope="function" so the commit runs before the response starts.
"""

from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient


def _get_db_dependants(dependant: Dependant):
    from app.core.dependencies import get_db

    for sub in dependant.dependencies:
        if sub.call is get_db:
            yield sub
        yield from _get_db_dependants(sub)


def _api_routes(routes):
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        # FastAPI 0.162 wraps include_router() output; walk the router inside.
        elif router := getattr(route, "original_router", None):
            yield from _api_routes(router.routes)


def test_every_get_db_dependency_is_function_scoped():
    from main import app

    uses = [
        (route, dep)
        for route in _api_routes(app.routes)
        for dep in _get_db_dependants(route.dependant)
    ]
    assert len(uses) > 30, "route walk found too few get_db uses to be complete"
    offenders = [
        f"{','.join(sorted(route.methods))} {route.path}"
        for route, dep in uses
        if dep.scope != "function"
    ]
    assert offenders == [], (
        'Depends(get_db) needs scope="function" so the commit runs before the '
        f"response is sent: {offenders}"
    )


async def test_sign_up_commits_before_the_response_starts(db_session):
    from app.core.dependencies import get_db
    from main import app

    events: list[str] = []

    async def recording_get_db():
        yield db_session
        await db_session.commit()
        events.append("commit")

    async def recording_app(scope, receive, send):
        async def recording_send(message):
            if message["type"] == "http.response.start":
                events.append("response.start")
            await send(message)

        await app(scope, receive, recording_send)

    app.dependency_overrides[get_db] = recording_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=recording_app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/api/auth/sign-up",
                json={
                    "email": "commit-order@example.com",
                    "password": "a-long-enough-password",
                    "name": "Order",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 201
    assert events == ["commit", "response.start"]


async def test_failed_commit_returns_500_not_success(db_session):
    from app.core.dependencies import get_db
    from main import app

    async def failing_commit_get_db():
        yield db_session
        raise RuntimeError("commit failed")

    app.dependency_overrides[get_db] = failing_commit_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as ac:
            resp = await ac.post(
                "/api/auth/sign-up",
                json={
                    "email": "commit-fails@example.com",
                    "password": "a-long-enough-password",
                    "name": "Fails",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 500
