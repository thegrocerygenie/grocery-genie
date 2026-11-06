"""Wait until sessions are blocked on a row lock, for the Postgres race tests.

A fixed sleep before the next step of a race guesses how long a session
takes to reach its lock, and loses now and then on a slow run. This polls
``pg_stat_activity`` instead: it returns once ``count`` sessions of this
database are waiting on a lock (``wait_event_type = 'Lock'``). The Postgres
cluster is shared, so only this database's sessions count.
"""

import asyncio

from sqlalchemy import text

_WAITING = text(
    "SELECT count(*) FROM pg_stat_activity "
    "WHERE datname = current_database() AND wait_event_type = 'Lock'"
)


async def wait_for_lock_waiters(factory, count: int, timeout: float = 10) -> None:
    async def poll() -> None:
        async with factory() as db:
            while (await db.execute(_WAITING)).scalar_one() < count:
                # pg_stat_activity is a snapshot per transaction: end it.
                await db.rollback()
                await asyncio.sleep(0.02)

    await asyncio.wait_for(poll(), timeout)
