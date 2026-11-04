"""RevenueCat TRANSFER webhooks under concurrent deliveries (V11-P0), on
Postgres only.

A transfer names users on two sides, and RevenueCat can deliver two transfers
between the same accounts at once (a restore on one device, then on the
other). Each delivery runs in its own transaction and locks the users' rows.
Two transfers that locked them one by one, in the order each event lists
them, could each hold one row and wait for the other: Postgres broke the
deadlock and one delivery answered 500. ``PremiumService`` locks every user
a transfer touches in one statement, in id order, so the second waits for
the first instead.

SQLite has one writer and ignores FOR UPDATE, so these tests skip there.
"""

import asyncio
import contextlib
import os
import uuid
from collections.abc import AsyncGenerator, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.models.database import RevenueCatEvent, User
from app.services.revenuecat_client import PremiumState
from tests.conftest import consented

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent transactions need Postgres (SQLite has one writer)",
)

SECRET = "rc-webhook-secret-for-tests"
WEBHOOK = "/api/webhooks/revenuecat"
USER_A = uuid.UUID("00000000-0000-0000-0000-0000000000a1")
USER_B = uuid.UUID("00000000-0000-0000-0000-0000000000b1")
# How long a REST read waits for the other delivery to reach one too. Longer
# than a delivery that is not blocked needs to get there.
MEET_SECONDS = 1.0


class MeetingRevenueCat:
    """A RevenueCat REST client whose first read in each delivery waits
    until the other delivery reads too (or MEET_SECONDS pass).

    Each delivery reads right after it locks its first user, so with
    one-by-one locks both hold a row here before either wants the other.
    """

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.met = asyncio.Event()

    async def get_premium(self, app_user_id: str) -> PremiumState:
        self.calls.append(app_user_id)
        if len(self.calls) >= 2:
            self.met.set()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self.met.wait(), timeout=MEET_SECONDS)
        return PremiumState(active=False)


@dataclass
class Harness:
    client: AsyncClient
    factory: async_sessionmaker[AsyncSession]
    revenuecat: MeetingRevenueCat


@pytest.fixture(autouse=True)
def revenuecat_config(monkeypatch) -> Iterator[None]:
    get_settings.cache_clear()
    monkeypatch.setenv("GG_REVENUECAT_WEBHOOK_SECRET", SECRET)
    yield
    get_settings.cache_clear()


@pytest.fixture
async def harness(db_engine) -> AsyncGenerator[Harness, None]:
    """Users A and B, and one transaction per request, as in production."""
    from app.core.dependencies import get_db
    from app.services.revenuecat_client import get_revenuecat_client
    from main import app

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as setup:
        for user_id, name in ((USER_A, "a"), (USER_B, "b")):
            setup.add(
                User(
                    id=user_id,
                    email=f"{name}@transfer.test",
                    name=name,
                    api_token=f"test-token-transfer-{name}-000000",
                    **consented(),
                )
            )
        await setup.commit()

    async def per_request_db() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    revenuecat = MeetingRevenueCat()
    app.dependency_overrides[get_db] = per_request_db
    app.dependency_overrides[get_revenuecat_client] = lambda: revenuecat
    # A deadlock answers 500, as in production, instead of raising here.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield Harness(client=client, factory=factory, revenuecat=revenuecat)
    for dependency in (get_db, get_revenuecat_client):
        app.dependency_overrides.pop(dependency, None)


def _transfer(old: uuid.UUID, new: uuid.UUID, at: datetime) -> dict:
    return {
        "api_version": "1.0",
        "event": {
            "id": str(uuid.uuid4()),
            "type": "TRANSFER",
            "app_user_id": str(new),
            "transferred_from": [str(old)],
            "transferred_to": [str(new)],
            "event_timestamp_ms": int(at.timestamp() * 1000),
            "environment": "SANDBOX",
            "store": "APP_STORE",
        },
    }


async def _post(h: Harness, body: dict) -> Response:
    return await h.client.post(
        WEBHOOK, json=body, headers={"Authorization": f"Bearer {SECRET}"}
    )


async def test_transfers_in_opposite_directions_do_not_deadlock(harness: Harness):
    now = datetime.now(UTC)
    # One timestamp, so whichever commits first, the other is not stale.
    a_to_b = _transfer(USER_A, USER_B, now)
    b_to_a = _transfer(USER_B, USER_A, now)

    responses = await asyncio.wait_for(
        asyncio.gather(_post(harness, a_to_b), _post(harness, b_to_a)), timeout=15
    )

    assert [r.status_code for r in responses] == [200, 200], [r.text for r in responses]
    assert [r.json()["status"] for r in responses] == ["applied", "applied"]
    async with harness.factory() as db:
        outcomes = (await db.execute(select(RevenueCatEvent.outcome))).scalars()
        assert sorted(outcomes) == ["applied", "applied"]
        for user_id in (USER_A, USER_B):
            user = await db.get(User, user_id)
            assert user is not None and user.premium_updated_at is not None
