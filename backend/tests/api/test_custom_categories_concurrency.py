"""Custom categories under concurrent requests (V11-P1), on Postgres only.

Each request here runs in its own transaction, as in production, so two can
overlap. ``CategoryService`` takes a lock on the user's row:

- create and rename hold it, so two creates at once cannot both pass the cap
  of 10 or the case-insensitive name check;
- delete holds it, and so does every path that attaches a custom category to
  a row (a correction, a budget, a manual receipt, a scan that applies an item
  mapping). Delete then never removes a category under a row that is about to
  point at it, which would fail the foreign key and answer 500.

SQLite has one writer and ignores FOR UPDATE, so these tests skip there.
"""

import asyncio
import io
import os
import uuid
from collections.abc import AsyncGenerator, Awaitable
from dataclasses import dataclass, field

import pytest
from fastapi import Request
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.seed import seed_default_categories
from app.models.database import (
    Budget,
    Category,
    LineItem,
    User,
    UserItemMapping,
)
from app.services.category_service import MAX_CUSTOM_CATEGORIES
from tests.conftest import consented

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="concurrent transactions need Postgres (SQLite has one writer)",
)

USER_ID = uuid.UUID("00000000-0000-0000-0000-0000000000d1")
# Long enough for a request that is not blocked to finish.
SETTLE_SECONDS = 0.5


@dataclass
class Hold:
    """Keeps one request's transaction open after its handler returns."""

    reached: asyncio.Event = field(default_factory=asyncio.Event)
    release: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass
class Harness:
    client: AsyncClient
    factory: async_sessionmaker[AsyncSession]
    holds: dict[str, Hold]

    def hold(self, name: str) -> Hold:
        self.holds[name] = Hold()
        return self.holds[name]


@pytest.fixture
async def harness(db_engine, mock_extractor) -> AsyncGenerator[Harness, None]:
    """A Premium user, the defaults seeded, and one transaction per request.

    A request sent with ``x-test-hold: <name>`` for a registered hold sets
    ``reached`` once its handler has returned, then waits for ``release``
    before it commits, so its locks stay held meanwhile.
    """
    from app.core.dependencies import get_db
    from app.core.security import get_current_user
    from app.llm.provider import get_receipt_extractor
    from main import app

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as setup:
        await seed_default_categories(setup)
        user = User(
            id=USER_ID,
            email="race@test.com",
            name="Race",
            api_token="test-token-race-0000000000",
            premium_active=True,
            premium_expires_at=None,
            **consented(),
        )
        setup.add(user)
        await setup.commit()

    holds: dict[str, Hold] = {}

    async def per_request_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            try:
                yield session
                hold = holds.get(request.headers.get("x-test-hold", ""))
                if hold is not None:
                    hold.reached.set()
                    await hold.release.wait()
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def current_user() -> User:
        return user

    app.dependency_overrides[get_db] = per_request_db
    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_receipt_extractor] = lambda: mock_extractor
    # A failed commit answers 500, as in production, instead of raising here.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield Harness(client=client, factory=factory, holds=holds)
    for dependency in (get_db, get_current_user, get_receipt_extractor):
        app.dependency_overrides.pop(dependency, None)


async def _count_custom(h: Harness) -> int:
    async with h.factory() as db:
        return (
            await db.execute(
                select(func.count())
                .select_from(Category)
                .where(Category.user_id == USER_ID)
            )
        ).scalar_one()


async def _custom(h: Harness, name: str) -> str:
    resp = await h.client.post("/api/categories", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _scan(h: Harness, image: bytes, **headers: str) -> Response:
    return await h.client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image), "image/jpeg")},
        headers=headers,
    )


async def _bananas(h: Harness, image: bytes) -> tuple[str, str]:
    """Scan the mock receipt; return its id and the bananas' line item id."""
    resp = await _scan(h, image)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    item = next(
        i for i in body["extraction"]["items"] if i["name"] == "Organic Bananas"
    )
    return body["receipt_id"], item["id"]


async def _race(
    h: Harness, first: Awaitable[Response], second: Awaitable[Response]
) -> tuple[Response, Response]:
    """Run ``first`` (sent with the "first" hold) until its handler returns,
    then start ``second``, let it run as far as it can, then let ``first``
    commit. Returns both responses."""
    hold = h.holds["first"]
    first_task = asyncio.ensure_future(first)
    await asyncio.wait_for(hold.reached.wait(), timeout=10)
    second_task = asyncio.ensure_future(second)
    await asyncio.sleep(SETTLE_SECONDS)
    hold.release.set()
    return await asyncio.wait_for(asyncio.gather(first_task, second_task), timeout=10)


async def _other_id(h: Harness) -> uuid.UUID:
    async with h.factory() as db:
        return (
            await db.execute(
                select(Category.id).where(
                    Category.is_default.is_(True), Category.name == "Other"
                )
            )
        ).scalar_one()


# --- (a) The cap and the name check hold under concurrent creates ---


async def test_concurrent_creates_stop_at_the_cap(harness: Harness):
    extra = 4
    responses = await asyncio.gather(
        *(
            harness.client.post("/api/categories", json={"name": f"Cat {n}"})
            for n in range(MAX_CUSTOM_CATEGORIES + extra)
        )
    )

    codes = sorted(r.status_code for r in responses)
    assert codes == [201] * MAX_CUSTOM_CATEGORIES + [409] * extra
    refused = [r.json()["detail"] for r in responses if r.status_code == 409]
    assert {d["code"] for d in refused} == {"category_limit_reached"}
    assert await _count_custom(harness) == MAX_CUSTOM_CATEGORIES


async def test_concurrent_creates_of_one_name_make_one(harness: Harness):
    # Twelve spellings that differ only in case, so without the lock each
    # could pass the check and the case-sensitive unique constraint too.
    names = [
        "".join(
            c.upper() if bit == "1" else c
            for c, bit in zip("garden", f"{n:06b}", strict=True)
        )
        for n in range(12)
    ]
    responses = await asyncio.gather(
        *(harness.client.post("/api/categories", json={"name": n}) for n in names)
    )

    codes = sorted(r.status_code for r in responses)
    assert codes == [201] + [409] * (len(names) - 1)
    refused = [r.json()["detail"] for r in responses if r.status_code == 409]
    assert {d["code"] for d in refused} == {"category_name_taken"}
    assert await _count_custom(harness) == 1


# --- (b) Delete against a request that attaches the category ---


async def test_budget_saved_while_its_category_is_deleted_gets_a_clean_400(
    harness: Harness,
):
    cid = await _custom(harness, "Garden")
    harness.hold("first")

    deleted, budget = await _race(
        harness,
        harness.client.delete(
            f"/api/categories/{cid}", headers={"x-test-hold": "first"}
        ),
        harness.client.post(
            "/api/budgets",
            json={"category_id": cid, "amount": 50, "period_start": "2026-03-01"},
        ),
    )

    assert deleted.status_code == 204
    assert budget.status_code == 400, budget.text
    async with harness.factory() as db:
        assert (await db.execute(select(Budget))).first() is None


async def test_category_deleted_while_a_budget_is_saved_takes_the_budget(
    harness: Harness,
):
    cid = await _custom(harness, "Garden")
    harness.hold("first")

    budget, deleted = await _race(
        harness,
        harness.client.post(
            "/api/budgets",
            json={"category_id": cid, "amount": 50, "period_start": "2026-03-01"},
            headers={"x-test-hold": "first"},
        ),
        harness.client.delete(f"/api/categories/{cid}"),
    )

    assert budget.status_code == 201, budget.text
    assert deleted.status_code == 204, deleted.text
    async with harness.factory() as db:
        assert (await db.execute(select(Budget))).first() is None


async def test_correction_to_a_category_being_deleted_gets_a_clean_400(
    harness: Harness, test_image_bytes: bytes
):
    cid = await _custom(harness, "Garden")
    receipt_id, item_id = await _bananas(harness, test_image_bytes)
    harness.hold("first")

    deleted, corrected = await _race(
        harness,
        harness.client.delete(
            f"/api/categories/{cid}", headers={"x-test-hold": "first"}
        ),
        harness.client.patch(
            f"/api/receipts/{receipt_id}",
            json={"items": [{"id": item_id, "category_id": cid}]},
        ),
    )

    assert deleted.status_code == 204
    assert corrected.status_code == 400, corrected.text
    async with harness.factory() as db:
        item = await db.get(LineItem, uuid.UUID(item_id))
        assert item is not None and item.category_id != uuid.UUID(cid)


async def test_category_deleted_during_a_correction_moves_the_item_to_other(
    harness: Harness, test_image_bytes: bytes
):
    cid = await _custom(harness, "Garden")
    receipt_id, item_id = await _bananas(harness, test_image_bytes)
    harness.hold("first")

    corrected, deleted = await _race(
        harness,
        harness.client.patch(
            f"/api/receipts/{receipt_id}",
            json={"items": [{"id": item_id, "category_id": cid}]},
            headers={"x-test-hold": "first"},
        ),
        harness.client.delete(f"/api/categories/{cid}"),
    )

    assert corrected.status_code == 200, corrected.text
    assert deleted.status_code == 204, deleted.text
    async with harness.factory() as db:
        item = await db.get(LineItem, uuid.UUID(item_id))
        assert item is not None and item.category_id == await _other_id(harness)
        mapping = (
            await db.execute(
                select(UserItemMapping).where(
                    UserItemMapping.raw_text_pattern == "organic bananas"
                )
            )
        ).scalar_one()
        assert mapping.category_id is None


async def test_scan_applying_a_mapping_to_a_category_being_deleted_skips_it(
    harness: Harness, test_image_bytes: bytes
):
    cid = await _custom(harness, "Garden")
    receipt_id, item_id = await _bananas(harness, test_image_bytes)
    taught = await harness.client.patch(
        f"/api/receipts/{receipt_id}",
        json={"items": [{"id": item_id, "category_id": cid}]},
    )
    assert taught.status_code == 200, taught.text
    harness.hold("first")

    deleted, scanned = await _race(
        harness,
        harness.client.delete(
            f"/api/categories/{cid}", headers={"x-test-hold": "first"}
        ),
        _scan(harness, test_image_bytes),
    )

    assert deleted.status_code == 204
    assert scanned.status_code == 200, scanned.text
    bananas = next(
        i
        for i in scanned.json()["extraction"]["items"]
        if i["name"] == "Organic Bananas"
    )
    assert bananas["category_id"] != cid


async def test_category_deleted_during_a_scan_moves_the_mapped_item_to_other(
    harness: Harness, test_image_bytes: bytes
):
    cid = await _custom(harness, "Garden")
    receipt_id, item_id = await _bananas(harness, test_image_bytes)
    taught = await harness.client.patch(
        f"/api/receipts/{receipt_id}",
        json={"items": [{"id": item_id, "category_id": cid}]},
    )
    assert taught.status_code == 200, taught.text
    harness.hold("first")

    scanned, deleted = await _race(
        harness,
        _scan(harness, test_image_bytes, **{"x-test-hold": "first"}),
        harness.client.delete(f"/api/categories/{cid}"),
    )

    assert scanned.status_code == 200, scanned.text
    assert deleted.status_code == 204, deleted.text
    new_item = next(
        i
        for i in scanned.json()["extraction"]["items"]
        if i["name"] == "Organic Bananas"
    )
    assert new_item["category_id"] == cid
    async with harness.factory() as db:
        item = await db.get(LineItem, uuid.UUID(new_item["id"]))
        assert item is not None and item.category_id == await _other_id(harness)


def _manual_receipt(cid: str) -> dict:
    return {
        "store_name": "Market",
        "date": "2026-03-10",
        "total": 3.0,
        "items": [
            {
                "name": "Kiwi",
                "unit_price": 3.0,
                "total_price": 3.0,
                "category_id": cid,
            }
        ],
    }


async def test_manual_receipt_with_a_category_being_deleted_gets_a_clean_400(
    harness: Harness,
):
    cid = await _custom(harness, "Garden")
    harness.hold("first")

    deleted, created = await _race(
        harness,
        harness.client.delete(
            f"/api/categories/{cid}", headers={"x-test-hold": "first"}
        ),
        harness.client.post("/api/receipts", json=_manual_receipt(cid)),
    )

    assert deleted.status_code == 204
    assert created.status_code == 400, created.text
    async with harness.factory() as db:
        assert (await db.execute(select(LineItem))).first() is None


async def test_category_deleted_during_a_manual_receipt_moves_the_item_to_other(
    harness: Harness,
):
    cid = await _custom(harness, "Garden")
    harness.hold("first")

    created, deleted = await _race(
        harness,
        harness.client.post(
            "/api/receipts",
            json=_manual_receipt(cid),
            headers={"x-test-hold": "first"},
        ),
        harness.client.delete(f"/api/categories/{cid}"),
    )

    assert created.status_code == 201, created.text
    assert deleted.status_code == 204, deleted.text
    item_id = created.json()["items"][0]["id"]
    async with harness.factory() as db:
        item = await db.get(LineItem, uuid.UUID(item_id))
        assert item is not None and item.category_id == await _other_id(harness)
