"""Migration 20261104_0021: category colour and icon (BC-05 AC 5, DA-9).

The round trip runs Alembic for real against a throwaway Postgres database
next to the test database (``<test db>_mig0021``), so it runs only with
``GG_TEST_DATABASE_URL`` on Postgres (``make backend-test-pg``). It seeds the
built-ins and custom categories at 0020, upgrades, checks the looks, then
downgrades and upgrades again. The frozen-copy check runs everywhere, like
the 0019 one in ``tests/services/test_store_service.py``.
"""

import importlib.util
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

from app.models.category_looks import DEFAULT_COLOR, DEFAULT_ICON, DEFAULT_LOOKS

BACKEND = Path(__file__).parents[2]
MIGRATION = BACKEND / "migrations/versions/20261104_0021_category_color_icon.py"
TEST_URL = os.environ.get("GG_TEST_DATABASE_URL", "")
ON_POSTGRES = TEST_URL.startswith("postgresql")


def _load_migration():
    spec = importlib.util.spec_from_file_location("m0021", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_migration_gives_built_ins_the_looks_the_app_has():
    """The migration keeps a frozen copy of the built-in looks; at this
    revision it matches the live one."""
    assert _load_migration()._BUILT_IN_LOOKS == DEFAULT_LOOKS


def _alembic(url: str, *args: str) -> None:
    env = {**os.environ, "GG_DATABASE_URL": url}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, result.stderr[-2000:]


@pytest.fixture
async def scratch_db():
    """An empty database beside the test one, dropped afterwards."""
    import asyncpg

    base, _, name = TEST_URL.rpartition("/")
    db = f"{name}_mig0021"
    admin_dsn = f"{base}/postgres".replace("postgresql+asyncpg", "postgresql")
    admin = await asyncpg.connect(admin_dsn)
    try:
        await admin.execute(f'DROP DATABASE IF EXISTS "{db}" WITH (FORCE)')
        await admin.execute(f'CREATE DATABASE "{db}"')
    finally:
        await admin.close()
    url = f"{base}/{db}"
    yield url, url.replace("postgresql+asyncpg", "postgresql")
    admin = await asyncpg.connect(admin_dsn)
    try:
        await admin.execute(f'DROP DATABASE IF EXISTS "{db}" WITH (FORCE)')
    finally:
        await admin.close()


async def _looks(dsn: str) -> dict[tuple[str, bool], tuple[str, str]]:
    import asyncpg

    conn = await asyncpg.connect(dsn)
    try:
        rows = await conn.fetch("SELECT name, is_default, color, icon FROM categories")
    finally:
        await conn.close()
    return {(r["name"], r["is_default"]): (r["color"], r["icon"]) for r in rows}


async def _columns(dsn: str) -> set[str]:
    import asyncpg

    conn = await asyncpg.connect(dsn)
    try:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'categories'"
        )
    finally:
        await conn.close()
    return {r["column_name"] for r in rows}


@pytest.mark.skipif(not ON_POSTGRES, reason="runs Alembic against Postgres")
async def test_upgrade_backfills_looks_then_downgrades_and_upgrades_again(
    scratch_db,
):
    import asyncpg

    url, dsn = scratch_db
    _alembic(url, "upgrade", "20261104_0020")

    user = uuid.uuid4()
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(
            "INSERT INTO users (id, email, name) VALUES ($1, 'mig@test.com', 'Mig')",
            user,
        )
        for order, name in enumerate(DEFAULT_LOOKS, start=1):
            await conn.execute(
                "INSERT INTO categories (id, name, is_default, user_id, sort_order) "
                "VALUES ($1, $2, true, NULL, $3)",
                uuid.uuid4(),
                name,
                order,
            )
        # Custom rows, one sharing a built-in's name: only is_default rows
        # take a built-in look.
        for order, name in [(101, "Garden"), (102, "Pet")]:
            await conn.execute(
                "INSERT INTO categories (id, name, is_default, user_id, sort_order) "
                "VALUES ($1, $2, false, $3, $4)",
                uuid.uuid4(),
                name,
                user,
                order,
            )
    finally:
        await conn.close()

    expected = {(name, True): look for name, look in DEFAULT_LOOKS.items()}
    expected[("Garden", False)] = (DEFAULT_COLOR, DEFAULT_ICON)
    expected[("Pet", False)] = (DEFAULT_COLOR, DEFAULT_ICON)

    _alembic(url, "upgrade", "20261104_0021")
    assert await _looks(dsn) == expected

    _alembic(url, "downgrade", "20261104_0020")
    assert {"color", "icon"}.isdisjoint(await _columns(dsn))

    _alembic(url, "upgrade", "20261104_0021")
    assert await _looks(dsn) == expected
