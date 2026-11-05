"""PREM-04 (DA-8 review): the export is bounded per user.

``GET /api/users/me/export`` builds the whole file in the request (receipt
images included), so each user gets ``GG_MAX_EXPORTS_PER_HOUR`` exports an
hour and one at a time. Past either, ``429`` with ``{"detail": {"code":
"export_rate_limited" | "export_in_progress", "message": ...}}`` and a
``Retry-After`` header. The one-at-a-time slot is a Postgres advisory lock on
the request's transaction, so it holds across API workers and is released
when the transaction ends, on success or error.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator
from datetime import date

import pytest
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.rate_limit import reset_ip_state
from app.models.database import (
    CanonicalItem,
    LineItem,
    PriceObservation,
    Receipt,
    Store,
    User,
)
from tests.conftest import _create_test_client, consented

EXPORT = "/api/users/me/export"


@pytest.fixture(autouse=True)
def _fresh_counts():
    reset_ip_state()
    yield
    reset_ip_state()


@pytest.fixture
async def premium_client(
    db_session, mock_extractor
) -> AsyncGenerator[AsyncClient, None]:
    from main import app

    user = User(
        email=f"export-limit-{uuid.uuid4().hex[:8]}@test.com",
        name="Limits",
        premium_active=True,
        **consented(),
    )
    db_session.add(user)
    await db_session.flush()
    _create_test_client(app, db_session, mock_extractor, user)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# --- rate limit -------------------------------------------------------------------


async def test_exports_past_the_hourly_limit_get_429(premium_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_exports_per_hour", 2)

    first = await premium_client.get(EXPORT)
    second = await premium_client.get(EXPORT, params={"format": "csv"})
    third = await premium_client.get(EXPORT, params={"format": "pdf"})

    assert first.status_code == second.status_code == 200
    assert third.status_code == 429
    assert third.json()["detail"]["code"] == "export_rate_limited"
    assert third.json()["detail"]["message"]
    assert int(third.headers["retry-after"]) > 0


async def test_a_rejected_export_does_not_use_the_allowance(
    premium_client, monkeypatch
):
    """A 422 is answered before the count: only built exports count."""
    monkeypatch.setattr(get_settings(), "max_exports_per_hour", 1)

    bad = await premium_client.get(
        EXPORT, params={"from": "2026-05-01", "to": "2026-04-01"}
    )
    good = await premium_client.get(EXPORT)

    assert bad.status_code == 422
    assert good.status_code == 200


async def test_the_summary_is_not_counted(premium_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_exports_per_hour", 1)

    for _ in range(3):
        assert (await premium_client.get(f"{EXPORT}/summary")).status_code == 200
    assert (await premium_client.get(EXPORT)).status_code == 200


# --- one at a time (any database; the in-process slot on SQLite) ------------------


async def test_a_second_export_while_one_builds_gets_429(premium_client, monkeypatch):
    from app.services import export_service

    started = asyncio.Event()
    release = asyncio.Event()
    real_build = export_service.ExportService.build

    calls = {"n": 0}

    async def slow_build(self, user, options, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:  # only the first build waits
            started.set()
            await release.wait()
        return await real_build(self, user, options, **kwargs)

    monkeypatch.setattr(export_service.ExportService, "build", slow_build)

    first = asyncio.create_task(premium_client.get(EXPORT))
    await asyncio.wait_for(started.wait(), 5)
    busy = await premium_client.get(EXPORT, params={"format": "csv"})
    release.set()
    done = await first
    after = await premium_client.get(EXPORT)

    assert busy.status_code == 429
    assert busy.json()["detail"]["code"] == "export_in_progress"
    assert int(busy.headers["retry-after"]) > 0
    assert done.status_code == 200
    assert after.status_code == 200


async def test_the_slot_is_released_when_the_build_fails(premium_client, monkeypatch):
    from app.services import export_service

    real_build = export_service.ExportService.build
    calls = {"n": 0}

    async def failing_once(self, user, options, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("disk full")
        return await real_build(self, user, options, **kwargs)

    monkeypatch.setattr(export_service.ExportService, "build", failing_once)

    with pytest.raises(RuntimeError, match="disk full"):
        await premium_client.get(EXPORT)
    again = await premium_client.get(EXPORT)

    assert again.status_code == 200


# --- one at a time across transactions (Postgres) ---------------------------------

on_postgres = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="the advisory lock needs Postgres and one transaction per request",
)

PG_USER_ID = uuid.UUID("00000000-0000-0000-0000-0000000000e8")


@pytest.fixture
async def pg_client(db_engine) -> AsyncGenerator[tuple[AsyncClient, dict], None]:
    """One session and transaction per request, as in production. A request
    with ``x-test-hold`` keeps its transaction open after its handler returns
    until the test releases it."""
    from app.core.dependencies import get_db
    from app.core.security import get_current_user
    from main import app

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as setup:
        user = User(
            id=PG_USER_ID,
            email="export-race@test.com",
            name="Race",
            premium_active=True,
            **consented(),
        )
        setup.add(user)
        await setup.commit()

    gates = {"reached": asyncio.Event(), "release": asyncio.Event()}

    async def per_request_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            try:
                yield session
                if request.headers.get("x-test-hold"):
                    gates["reached"].set()
                    await gates["release"].wait()
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = per_request_db
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, gates
    for dependency in (get_db, get_current_user):
        app.dependency_overrides.pop(dependency, None)


@on_postgres
async def test_parallel_exports_on_postgres_build_one_at_a_time(pg_client):
    """The first export's transaction is still open (its lock held): a second
    request in its own transaction gets 429; once the first commits, the next
    export runs."""
    client, gates = pg_client

    first = asyncio.create_task(client.get(EXPORT, headers={"x-test-hold": "1"}))
    await asyncio.wait_for(gates["reached"].wait(), 10)
    busy = await client.get(EXPORT, params={"format": "csv"})
    gates["release"].set()
    done = await first
    after = await client.get(EXPORT)

    assert busy.status_code == 429, busy.text
    assert busy.json()["detail"]["code"] == "export_in_progress"
    assert done.status_code == 200
    assert after.status_code == 200


@on_postgres
async def test_postgres_slot_is_released_on_error(pg_client, monkeypatch):
    from app.services import export_service

    client, _ = pg_client
    real_build = export_service.ExportService.build
    calls = {"n": 0}

    async def failing_once(self, user, options, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("disk full")
        return await real_build(self, user, options, **kwargs)

    monkeypatch.setattr(export_service.ExportService, "build", failing_once)

    failed = await client.get(EXPORT)
    again = await client.get(EXPORT)

    assert failed.status_code == 500
    assert again.status_code == 200


# --- a build whose client has gone stops before its next page ----------------------


async def _user_with_priced_receipts(db_session, n: int) -> User:
    """A user with ``n`` receipts, each with one line and its price."""
    user = User(
        email=f"export-pages-{uuid.uuid4().hex[:8]}@test.com",
        name="Pages",
        premium_active=True,
        **consented(),
    )
    store = Store(name="FreshCo", normalized_name="freshco")
    db_session.add_all([user, store])
    await db_session.flush()
    for day in range(1, n + 1):
        receipt = Receipt(
            user_id=user.id,
            store_id=store.id,
            store_name="FreshCo",
            date=date(2026, 3, day),
            status="confirmed",
            currency="USD",
            total=1.0,
        )
        item = CanonicalItem(user_id=user.id, canonical_name=f"Item {day}")
        db_session.add_all([receipt, item])
        await db_session.flush()
        line = LineItem(
            receipt_id=receipt.id,
            raw_name=f"ITEM {day}",
            quantity=1,
            unit_price=1.0,
            total_price=1.0,
            position=0,
            canonical_item_id=item.id,
        )
        db_session.add(line)
        await db_session.flush()
        db_session.add(
            PriceObservation(
                user_id=user.id,
                canonical_item_id=item.id,
                receipt_id=receipt.id,
                line_item_id=line.id,
                store_id=store.id,
                date=receipt.date,
                unit_price=1.0,
                quantity=1,
                currency="USD",
            )
        )
    await db_session.flush()
    return user


@pytest.mark.parametrize(
    ("fmt", "include"),
    [
        ("json", None),  # receipt pages
        ("csv", None),
        ("pdf", None),
        ("json", "images"),  # receipt pages, read for their images
        ("csv", "prices"),  # price pages
    ],
)
async def test_build_stops_before_the_next_page_once_its_client_is_gone(
    db_session, monkeypatch, tmp_path, fmt, include
):
    """``should_stop`` (the route passes ``request.is_disconnected``) is asked
    before each page. The client goes after the first page, so the build
    raises ``ExportCancelledError`` instead of reading the second, and every
    spooled file is closed."""
    from app.image.storage import LocalFileStorage
    from app.services import export_service
    from app.services.export_service import (
        ExportCancelledError,
        ExportFormat,
        ExportOptions,
        ExportService,
        parse_includes,
    )

    monkeypatch.setattr(export_service, "BATCH_SIZE", 1)
    spools: list = []
    real_spool = export_service._spool

    def tracking_spool():
        spool = real_spool()
        spools.append(spool)
        return spool

    monkeypatch.setattr(export_service, "_spool", tracking_spool)

    pages: list = []

    def counted(read_pages):
        async def pages_of(self, user_id, options):
            async for page in read_pages(self, user_id, options):
                pages.append(page)
                yield page

        return pages_of

    for name in ("_receipt_batches", "_price_batches"):
        monkeypatch.setattr(ExportService, name, counted(getattr(ExportService, name)))

    user = await _user_with_priced_receipts(db_session, 3)

    async def gone_after_one_page() -> bool:
        return len(pages) >= 1

    service = ExportService(
        db_session,
        storage=LocalFileStorage(str(tmp_path)),
        should_stop=gone_after_one_page,
    )
    options = ExportOptions(fmt=ExportFormat(fmt), includes=parse_includes(include))

    with pytest.raises(ExportCancelledError):
        await service.build(user, options)

    assert len(pages) == 1
    assert spools
    assert all(spool.closed for spool in spools)


async def test_build_reads_every_page_while_its_client_stays(db_session, monkeypatch):
    from app.services import export_service
    from app.services.export_service import ExportOptions, ExportService

    monkeypatch.setattr(export_service, "BATCH_SIZE", 1)
    user = await _user_with_priced_receipts(db_session, 3)
    asked: list[None] = []

    async def still_here() -> bool:
        asked.append(None)
        return False

    export = await ExportService(db_session, should_stop=still_here).build(
        user, ExportOptions()
    )
    try:
        assert export.counts.receipt_count == 3
        assert export.counts.price_observation_count == 3
        assert asked  # the build did ask
    finally:
        export.close()
