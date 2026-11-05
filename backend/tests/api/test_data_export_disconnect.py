"""PREM-04: an export whose client goes away stops building.

A real uvicorn server on a local port runs the app with its real middleware
and its own ``get_db`` (one session per request, on the test database). A TCP
client asks for an export and closes the connection while the build is on its
first page. The build asks ``request.is_disconnected()`` before each page, so
it stops at the next one: no file, its spooled file closed, its DB session
ended, no ``data_exported`` event, and the user's export slot free again.

A Starlette ``BaseHTTPMiddleware`` in the stack hides the disconnect from the
route (its wrapped ``receive`` drops the message), so behind the old
``RateLimitMiddleware`` this build read every page.
"""

import asyncio
import socket
import uuid
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass, field
from datetime import date

import httpx
import pytest
import uvicorn
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import dependencies
from app.core.rate_limit import reset_ip_state
from app.core.security import create_token
from app.models.database import Receipt, User
from tests.api.test_analytics import SpyBackend
from tests.conftest import consented

EXPORT = "/api/users/me/export"
RECEIPTS = 3  # a page each: BATCH_SIZE is 1 here
WAIT = 10.0  # seconds; each wait ends long before this unless a step hangs


async def _wait_for(condition: Callable[[], bool], timeout: float = WAIT) -> None:
    async with asyncio.timeout(timeout):
        while not condition():
            await asyncio.sleep(0.01)


@pytest.fixture(autouse=True)
def _fresh_counts():
    reset_ip_state()
    yield
    reset_ip_state()


@pytest.fixture
async def exporter(db_engine) -> User:
    """A Premium user with ``RECEIPTS`` receipts, committed, so that each
    request's own session reads them."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as setup:
        user = User(
            email=f"export-gone-{uuid.uuid4().hex[:8]}@test.com",
            name="Gone",
            premium_active=True,
            **consented(),
        )
        setup.add(user)
        await setup.flush()
        setup.add_all(
            Receipt(
                user_id=user.id,
                date=date(2026, 3, day),
                store_name="FreshCo",
                status="confirmed",
                currency="USD",
                total=1.0,
            )
            for day in range(1, RECEIPTS + 1)
        )
        await setup.commit()
    return user


@dataclass
class RequestSessions:
    opened: list[AsyncSession] = field(default_factory=list)
    closed: list[AsyncSession] = field(default_factory=list)


@pytest.fixture
def request_sessions(db_engine, monkeypatch) -> RequestSessions:
    """The app's own ``get_db`` on the test database, recording each
    request's session as it opens and closes."""
    sessions = RequestSessions()

    class TrackedSession(AsyncSession):
        async def close(self) -> None:
            await super().close()
            sessions.closed.append(self)

    factory = async_sessionmaker(
        db_engine, class_=TrackedSession, expire_on_commit=False
    )

    def open_session() -> AsyncSession:
        session = factory()
        sessions.opened.append(session)
        return session

    monkeypatch.setattr(dependencies, "async_session_factory", open_session)
    return sessions


@dataclass
class LiveServer:
    server: uvicorn.Server
    port: int
    analytics: SpyBackend


@pytest.fixture
async def live_server(exporter, request_sessions) -> AsyncGenerator[LiveServer, None]:
    """The app on uvicorn at 127.0.0.1, signed in as ``exporter``."""
    from app.core.security import get_current_user
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    spy = SpyBackend()
    app.dependency_overrides[get_current_user] = lambda: exporter
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    server = uvicorn.Server(
        uvicorn.Config(app, lifespan="off", log_config=None, access_log=False)
    )
    serving = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        await _wait_for(lambda: server.started)
        yield LiveServer(server=server, port=sock.getsockname()[1], analytics=spy)
    finally:
        server.should_exit = True
        await asyncio.wait_for(serving, WAIT)
        sock.close()
        for dependency in (get_current_user, get_analytics_service):
            app.dependency_overrides.pop(dependency, None)


async def test_export_stops_when_its_client_disconnects(
    live_server, exporter, request_sessions, monkeypatch
):
    from app.services import export_service
    from app.services.export_service import ExportService

    monkeypatch.setattr(export_service, "BATCH_SIZE", 1)

    spools: list = []
    real_spool = export_service._spool

    def tracking_spool():
        spool = real_spool()
        spools.append(spool)
        return spool

    monkeypatch.setattr(export_service, "_spool", tracking_spool)

    # The first page waits until uvicorn has seen the connection close.
    on_first_page = asyncio.Event()
    pages = 0
    real_line_items = ExportService._line_items

    async def counted_line_items(self, receipt_ids, categories):
        nonlocal pages
        pages += 1
        if pages == 1:
            on_first_page.set()
            await _wait_for(lambda: not live_server.server.server_state.connections)
        return await real_line_items(self, receipt_ids, categories)

    monkeypatch.setattr(ExportService, "_line_items", counted_line_items)

    built: list = []
    build_ended = asyncio.Event()
    real_build = ExportService.build

    async def watched_build(self, *args, **kwargs):
        try:
            export = await real_build(self, *args, **kwargs)
            built.append(export)
            return export
        finally:
            build_ended.set()

    monkeypatch.setattr(ExportService, "build", watched_build)

    token, _ = create_token(user_id=exporter.id, typ="access")
    reader, writer = await asyncio.open_connection("127.0.0.1", live_server.port)
    writer.write(
        (
            f"GET {EXPORT} HTTP/1.1\r\n"
            "Host: 127.0.0.1\r\n"
            f"Authorization: Bearer {token}\r\n\r\n"
        ).encode()
    )
    await writer.drain()
    await asyncio.wait_for(on_first_page.wait(), WAIT)
    writer.close()
    await writer.wait_closed()
    await asyncio.wait_for(build_ended.wait(), WAIT)
    await _wait_for(
        lambda: len(request_sessions.closed) == len(request_sessions.opened)
    )

    assert pages == 1, (
        f"the build read {pages} of {RECEIPTS} pages after its client left"
    )
    assert built == []
    assert spools
    assert all(spool.closed for spool in spools)
    assert len(request_sessions.opened) == 1
    assert [e for e in live_server.analytics.calls if e[0] == "data_exported"] == []

    # The slot is free: on Postgres the advisory lock went with the transaction.
    async with httpx.AsyncClient(
        base_url=f"http://127.0.0.1:{live_server.port}", timeout=WAIT
    ) as client:
        again = await client.get(EXPORT, headers={"Authorization": f"Bearer {token}"})
    assert again.status_code == 200, again.text
    assert len(again.json()["receipts"]) == RECEIPTS
