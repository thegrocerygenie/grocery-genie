from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
)


def _get_sync_database_url(async_url: str) -> str:
    """Convert async database URL to sync equivalent."""
    return async_url.replace("+asyncpg", "").replace("+aiosqlite", "")


def get_sync_session_factory():
    """Lazy sync session factory for Celery tasks."""
    sync_url = _get_sync_database_url(settings.database_url)
    sync_eng = create_engine(sync_url, echo=settings.database_echo)
    return sessionmaker(sync_eng, class_=Session)


async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
