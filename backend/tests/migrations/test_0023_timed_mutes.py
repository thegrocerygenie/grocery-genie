"""Migration 20261104_0023: timed price alert mutes (PI-03 AC 11, DA-7).

Like the 0022 round trip, this runs Alembic for real against a throwaway
Postgres database next to the test database (``<test db>_mig0023``), so it
runs only with ``GG_TEST_DATABASE_URL`` on Postgres (``make backend-test-pg``).
It seeds an item mute and a store mute at 0022, upgrades, checks that both
read as forever (a null ``muted_until``), adds an ended and a live timed mute
to each table, then downgrades: only the forever mutes may remain, since the
old code has no end and would keep a timed mute forever. Then it upgrades
again.
"""

import uuid
from datetime import UTC, datetime

import pytest

from tests.migrations.test_0021_category_color_icon import (
    ON_POSTGRES,
    TEST_URL,
    _alembic,
)

pytestmark = pytest.mark.skipif(not ON_POSTGRES, reason="runs Alembic on Postgres")

TABLES = ("price_alert_item_mutes", "price_alert_store_mutes")


@pytest.fixture
async def scratch_db():
    """An empty database beside the test one, dropped afterwards."""
    import asyncpg

    base, _, name = TEST_URL.rpartition("/")
    db = f"{name}_mig0023"
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


async def _fetch(dsn: str, sql: str, *args):
    import asyncpg

    conn = await asyncpg.connect(dsn)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _has_column(dsn: str, table: str) -> bool:
    rows = await _fetch(
        dsn,
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_name = $1 AND column_name = 'muted_until'",
        table,
    )
    if rows:
        assert rows[0]["data_type"] == "timestamp with time zone"
    return bool(rows)


async def test_existing_mutes_become_forever_then_downgrade_and_upgrade_again(
    scratch_db,
):
    url, dsn = scratch_db
    _alembic(url, "upgrade", "20261104_0022")
    user, item, store = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await _fetch(
        dsn,
        "INSERT INTO users (id, email, name) VALUES ($1, 'mig23@test.com', 'Mig')",
        user,
    )
    await _fetch(
        dsn,
        "INSERT INTO canonical_items (id, user_id, canonical_name) "
        "VALUES ($1, $2, 'Bananas')",
        item,
        user,
    )
    await _fetch(
        dsn,
        "INSERT INTO stores (id, name, normalized_name) "
        "VALUES ($1, 'Loblaws', 'loblaws')",
        store,
    )
    await _fetch(
        dsn,
        "INSERT INTO price_alert_item_mutes (id, user_id, canonical_item_id) "
        "VALUES ($1, $2, $3)",
        uuid.uuid4(),
        user,
        item,
    )
    await _fetch(
        dsn,
        "INSERT INTO price_alert_store_mutes (id, user_id, store_id, store_name) "
        "VALUES ($1, $2, $3, 'Loblaws')",
        uuid.uuid4(),
        user,
        store,
    )

    _alembic(url, "upgrade", "20261104_0023")
    for table in TABLES:
        assert await _has_column(dsn, table)
        # Null is forever: every mute made before keeps working as it did.
        rows = await _fetch(dsn, f"SELECT muted_until FROM {table}")  # noqa: S608
        assert [r["muted_until"] for r in rows] == [None]

    forever = {
        table: [r["id"] for r in await _fetch(dsn, f"SELECT id FROM {table}")]  # noqa: S608
        for table in TABLES
    }
    ended = datetime(2020, 1, 1, tzinfo=UTC)
    live = datetime(2099, 1, 1, tzinfo=UTC)
    for n, until in enumerate((ended, live)):
        other_item, other_store = uuid.uuid4(), uuid.uuid4()
        await _fetch(
            dsn,
            "INSERT INTO canonical_items (id, user_id, canonical_name) "
            "VALUES ($1, $2, $3)",
            other_item,
            user,
            f"Item {n}",
        )
        await _fetch(
            dsn,
            "INSERT INTO stores (id, name, normalized_name) VALUES ($1, $2, $2)",
            other_store,
            f"store {n}",
        )
        await _fetch(
            dsn,
            "INSERT INTO price_alert_item_mutes "
            "(id, user_id, canonical_item_id, muted_until) VALUES ($1, $2, $3, $4)",
            uuid.uuid4(),
            user,
            other_item,
            until,
        )
        await _fetch(
            dsn,
            "INSERT INTO price_alert_store_mutes "
            "(id, user_id, store_id, store_name, muted_until) "
            "VALUES ($1, $2, $3, 'Other', $4)",
            uuid.uuid4(),
            user,
            other_store,
            until,
        )
    [row] = await _fetch(
        dsn, "SELECT muted_until FROM price_alert_item_mutes WHERE muted_until > now()"
    )
    assert row["muted_until"] == live

    _alembic(url, "downgrade", "20261104_0022")
    for table in TABLES:
        assert not await _has_column(dsn, table)
        # Only the forever mutes stay: a timed one, ended or not, would come
        # back as forever on code that cannot end it.
        rows = await _fetch(dsn, f"SELECT id FROM {table}")  # noqa: S608
        assert [r["id"] for r in rows] == forever[table]

    _alembic(url, "upgrade", "20261104_0023")
    for table in TABLES:
        assert await _has_column(dsn, table)
        rows = await _fetch(dsn, f"SELECT muted_until FROM {table}")  # noqa: S608
        assert [r["muted_until"] for r in rows] == [None]
