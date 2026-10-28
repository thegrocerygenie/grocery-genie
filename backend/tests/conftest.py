import io
import os
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

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
from app.llm.provider import MockReceiptExtractor
from app.models.database import Base
from app.services.ai_consent import AI_CONSENT_POLICY_VERSION

# Count rate limits in memory: the suite has no Redis. Clear the cache in case
# an import above already read the settings.
os.environ.setdefault("GG_RATE_LIMIT_STORAGE", "memory")
get_settings.cache_clear()

# Use SQLite for tests (async via aiosqlite)
TEST_DATABASE_URL = "sqlite+aiosqlite://"

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
    """Create async engine with in-memory SQLite."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
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
        **consented(),
    )

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
        **consented(),
    )

    _create_test_client(app, db_session, mock_extractor, user_b)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
