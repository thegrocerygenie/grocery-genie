import io
import os
import uuid
from collections.abc import AsyncGenerator, Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path

import litellm
import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core import clock
from app.core.config import get_settings
from app.llm.provider import (
    MockCategoryAssigner,
    MockEmbedder,
    MockReceiptExtractor,
    SentenceTransformerEmbedder,
    get_category_assigner,
    get_embedder,
)
from app.models.database import Base
from app.services.ai_consent import AI_CONSENT_POLICY_VERSION

# Count rate limits in memory: the suite has no Redis. Clear the cache in case
# an import above already read the settings.
os.environ.setdefault("GG_RATE_LIMIT_STORAGE", "memory")
os.environ.setdefault("GG_ANALYTICS_STORAGE", "log")
get_settings.cache_clear()

# SQLite in memory by default (fast). Set GG_TEST_DATABASE_URL to a Postgres
# database to run the suite the way production runs (`make backend-test-pg`):
# SQLite ignores FOR UPDATE and some ON CONFLICT and JSON behavior.
TEST_DATABASE_URL = os.environ.get("GG_TEST_DATABASE_URL", "sqlite+aiosqlite://")

DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEV_USER_TOKEN = "test-token-user-a-00000000"

USER_B_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
USER_B_TOKEN = "test-token-user-b-00000000"


def consented() -> dict:
    """User fields for a user who allowed receipts to go to the AI."""
    return {
        "ai_consent_at": datetime.now(UTC),
        "ai_consent_version": AI_CONSENT_POLICY_VERSION,
    }


# The mock receipt and most fixtures are dated March 2026. Only the budget
# period that holds today alerts (M5), so pin today inside that period. A test
# that crosses periods sets ``clock.today`` itself.
TEST_TODAY = date(2026, 3, 20)


@pytest.fixture(autouse=True)
def pinned_today(monkeypatch) -> date:
    monkeypatch.setattr(clock, "today", lambda: TEST_TODAY)
    return TEST_TODAY


class RealLLMCallError(RuntimeError):
    """A test reached litellm.acompletion without monkeypatching it."""


@dataclass
class LLMGuard:
    calls: list[dict] = field(default_factory=list)


# The LLM validation harness calls the real model on purpose when its env is set.
_LLM_VALIDATION_DIR = Path(__file__).parent / "llm_validation"


@pytest.fixture(autouse=True)
def llm_guard(request, monkeypatch) -> Iterator[LLMGuard]:
    """Block real LLM calls: a call raises, and the test fails at teardown.

    The raise alone isn't enough, because ReceiptService catches the
    assigner's error and falls back to rule-based categories. A test that
    fakes the call monkeypatches ``litellm.acompletion`` itself, which
    replaces this guard for that test.
    """
    guard = LLMGuard()
    if request.node.path.is_relative_to(_LLM_VALIDATION_DIR):
        yield guard
        return

    async def blocked_acompletion(**kwargs):
        guard.calls.append(kwargs)
        raise RealLLMCallError(
            f"Test called the real LLM (model={kwargs.get('model')!r}). "
            "Override the dependency with a mock or monkeypatch "
            "litellm.acompletion."
        )

    monkeypatch.setattr(litellm, "acompletion", blocked_acompletion)
    yield guard
    if guard.calls:
        pytest.fail(
            f"{len(guard.calls)} real LLM call(s) blocked; "
            "see RealLLMCallError in the log",
            pytrace=False,
        )


@pytest.fixture(autouse=True)
def mock_category_assigner() -> Iterator[None]:
    """Use the mock category assigner in every test app.

    Fixtures that build a test app clear ``dependency_overrides`` on
    teardown, so set it again for each test. A fixture that clears the
    overrides before its test runs drops this one; ``llm_guard`` then fails
    that test.
    """
    from main import app

    app.dependency_overrides[get_category_assigner] = MockCategoryAssigner
    yield
    app.dependency_overrides.pop(get_category_assigner, None)


class RealEmbeddingModelError(RuntimeError):
    """A test tried to load the real sentence-transformers model."""


@pytest.fixture(autouse=True)
def mock_embedder(monkeypatch) -> Iterator[MockEmbedder]:
    """Item-name embeddings come from MockEmbedder in every test app.

    Loading the real model takes seconds (and a download on a fresh host),
    so it raises here; a test that wants set similarities fills
    ``mock_embedder.vectors``.
    """
    from main import app

    def blocked_load(self):
        raise RealEmbeddingModelError(
            "Test loaded the real embedding model; use the mock_embedder fixture."
        )

    monkeypatch.setattr(SentenceTransformerEmbedder, "_load_model", blocked_load)
    embedder = MockEmbedder()
    app.dependency_overrides[get_embedder] = lambda: embedder
    yield embedder
    app.dependency_overrides.pop(get_embedder, None)


@pytest.fixture
def everyone_premium(monkeypatch) -> None:
    """Every signed-in user counts as Premium, for tests of a Premium feature's
    behavior rather than its gate (PREM-02 made comparison and mutes Premium).
    The gates themselves are tested against the stored entitlement, in
    ``tests/api/test_premium_gating.py``."""
    from app.core import entitlements

    monkeypatch.setattr(entitlements, "is_premium", lambda user: True)


async def set_premium(db_session, user_id: uuid.UUID, active: bool) -> None:
    """Set the stored entitlement of ``user_id``, as RevenueCat would: Premium
    with no expiry, or none."""
    from app.models.database import User

    user = await db_session.get(User, user_id)
    assert user is not None
    user.premium_active = active
    user.premium_expires_at = None
    await db_session.flush()


@pytest.fixture
def mock_extractor() -> MockReceiptExtractor:
    return MockReceiptExtractor()


@pytest.fixture
def test_image_bytes() -> bytes:
    """Generate a valid JPEG image with texture that passes quality checks."""
    import random

    random.seed(42)
    img = Image.new("RGB", (400, 600), color=(240, 240, 240))
    # Add noise/texture so it passes blur detection (non-zero Laplacian)
    pixels = img.load()
    for x in range(0, 400, 2):
        for y in range(0, 600, 2):
            v = random.randint(100, 200)
            pixels[x, y] = (v, v, v)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
async def db_engine():
    """A fresh schema per test, on TEST_DATABASE_URL."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            # canonical_item_aliases.embedding is a pgvector column.
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional test DB session."""
    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


def _create_test_client(app, db_session, mock_extractor, user):
    """Create an AsyncClient with dependency overrides for a given user."""
    from app.core.dependencies import get_db
    from app.core.security import get_current_user
    from app.llm.provider import get_receipt_extractor

    async def override_get_current_user():
        return user

    async def override_get_db():
        yield db_session

    def override_get_extractor():
        return mock_extractor

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_receipt_extractor] = override_get_extractor

    return app


@pytest.fixture
async def client(mock_extractor, db_session) -> AsyncGenerator[AsyncClient, None]:
    """httpx.AsyncClient bound to test app with mock dependencies (User A)."""
    from app.models.database import User
    from main import app

    test_user = User(
        id=DEV_USER_ID,
        email="test@test.com",
        name="Test User",
        api_token=DEV_USER_TOKEN,
        # All three alert thresholds on: the behavior these tests were written
        # against (the column default turns 50% off).
        notif_threshold_50=True,
        notif_threshold_80=True,
        notif_threshold_100=True,
        **consented(),
    )
    # Stored, as a signed-in user always is: Postgres enforces the foreign
    # keys from receipts, budgets and notifications (SQLite does not).
    test_user = await db_session.merge(test_user)
    await db_session.flush()

    _create_test_client(app, db_session, mock_extractor, test_user)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def client_user_b(
    mock_extractor, db_session
) -> AsyncGenerator[AsyncClient, None]:
    """httpx.AsyncClient for User B (for isolation tests)."""
    from app.models.database import User
    from main import app

    user_b = User(
        id=USER_B_ID,
        email="userb@test.com",
        name="User B",
        api_token=USER_B_TOKEN,
        # All three alert thresholds on: the behavior these tests were written
        # against (the column default turns 50% off).
        notif_threshold_50=True,
        notif_threshold_80=True,
        notif_threshold_100=True,
        **consented(),
    )
    # Stored, as a signed-in user always is: Postgres enforces the foreign
    # keys from receipts, budgets and notifications (SQLite does not).
    user_b = await db_session.merge(user_b)
    await db_session.flush()

    _create_test_client(app, db_session, mock_extractor, user_b)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def stored_client(db_session, mock_extractor):
    """A signed-in user stored in the database, as in production. Use it when a
    route reads or writes the user's own row (PATCH /users/me, the budget
    currency, preferences); the default `client` user exists only in memory."""
    from app.models.database import User
    from main import app

    user = User(
        email="currency@test.com",
        name="Currency",
        notif_threshold_50=True,
        notif_threshold_80=True,
        notif_threshold_100=True,
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


async def ensure_user(db_session, user_id: uuid.UUID) -> uuid.UUID:
    """Store a user row for ``user_id`` if there is none. For tests that write
    rows for a user directly: Postgres enforces their foreign keys."""
    from app.models.database import User

    if await db_session.get(User, user_id) is None:
        db_session.add(
            User(
                id=user_id,
                email=f"{user_id}@test.com",
                name="Test",
                notif_threshold_50=True,
                notif_threshold_80=True,
                notif_threshold_100=True,
                **consented(),
            )
        )
        await db_session.flush()
    return user_id
