"""Celery tasks use a sync engine; its driver must be installed and explicit."""

from sqlalchemy import create_engine

from app.core.dependencies import _get_sync_database_url

ASYNC_URL = "postgresql+asyncpg://u:p@db:5432/grocery_genie"


def test_sync_url_names_the_psycopg_driver():
    assert (
        _get_sync_database_url(ASYNC_URL)
        == "postgresql+psycopg://u:p@db:5432/grocery_genie"
    )


def test_sync_engine_can_be_built_for_postgres():
    """create_engine imports the DBAPI without connecting; fails if missing."""
    engine = create_engine(_get_sync_database_url(ASYNC_URL))
    assert engine.dialect.driver == "psycopg"


def test_sqlite_url_is_left_usable():
    assert _get_sync_database_url("sqlite+aiosqlite://") == "sqlite://"
