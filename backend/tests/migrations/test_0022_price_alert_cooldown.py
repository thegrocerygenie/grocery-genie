"""Migration 20261104_0022: the user's price alert cooldown (PI-03 AC 8, DA-4).

Like the 0021 round trip, this runs Alembic for real against a throwaway
Postgres database next to the test database (``<test db>_mig0022``), so it
runs only with ``GG_TEST_DATABASE_URL`` on Postgres (``make backend-test-pg``).
It seeds users at 0021, upgrades, checks that every existing user reads the
server default (a null cooldown) and that the database refuses a value outside
1-30, then downgrades and upgrades again.
"""

import uuid

import pytest

from tests.migrations.test_0021_category_color_icon import (
    ON_POSTGRES,
    TEST_URL,
    _alembic,
)

pytestmark = pytest.mark.skipif(not ON_POSTGRES, reason="runs Alembic on Postgres")


@pytest.fixture
async def scratch_db():
    """An empty database beside the test one, dropped afterwards."""
    import asyncpg

    base, _, name = TEST_URL.rpartition("/")
    db = f"{name}_mig0022"
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


async def _columns(dsn: str) -> set[str]:
    rows = await _fetch(
        dsn,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'",
    )
    return {r["column_name"] for r in rows}


async def test_existing_users_keep_the_default_then_downgrade_and_upgrade_again(
    scratch_db,
):
    import asyncpg

    url, dsn = scratch_db
    _alembic(url, "upgrade", "20261104_0021")
    users = [uuid.uuid4(), uuid.uuid4()]
    for n, user in enumerate(users):
        await _fetch(
            dsn,
            "INSERT INTO users (id, email, name, price_alert_threshold_percent) "
            "VALUES ($1, $2, 'Mig', $3)",
            user,
            f"mig{n}@test.com",
            None if n == 0 else 20,
        )

    _alembic(url, "upgrade", "20261104_0022")
    rows = await _fetch(
        dsn,
        "SELECT id, price_alert_cooldown_days, price_alert_threshold_percent "
        "FROM users ORDER BY email",
    )
    # Null is the server default (GG_PRICE_ALERT_COOLDOWN_DAYS, 7): every
    # existing user keeps the cooldown they had. Other settings are untouched.
    assert [(r["id"], r["price_alert_cooldown_days"]) for r in rows] == [
        (users[0], None),
        (users[1], None),
    ]
    assert [r["price_alert_threshold_percent"] for r in rows] == [None, 20]

    await _fetch(
        dsn, "UPDATE users SET price_alert_cooldown_days = 30 WHERE id = $1", users[0]
    )
    for bad in (0, 31):
        with pytest.raises(asyncpg.CheckViolationError):
            await _fetch(
                dsn,
                "UPDATE users SET price_alert_cooldown_days = $2 WHERE id = $1",
                users[1],
                bad,
            )

    _alembic(url, "downgrade", "20261104_0021")
    assert "price_alert_cooldown_days" not in await _columns(dsn)
    assert len(await _fetch(dsn, "SELECT id FROM users")) == 2

    _alembic(url, "upgrade", "20261104_0022")
    assert "price_alert_cooldown_days" in await _columns(dsn)
    rows = await _fetch(dsn, "SELECT price_alert_cooldown_days FROM users")
    assert [r["price_alert_cooldown_days"] for r in rows] == [None, None]
