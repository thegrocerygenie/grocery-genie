"""Waitlist tasks for the free year of Premium (V11-P5).

- ``sync_and_match_waitlist`` (beat, daily; run it once at launch as the
  backfill): copy the Resend audience into ``waitlist_entries``, then match
  every verified account on it that has no free year yet. Without
  ``GG_RESEND_WAITLIST_AUDIENCE_ID`` it matches against the copy already
  there (a one-off CSV export imported with ``import-csv``). Nothing runs
  once the claim window has closed.
- ``retry_waitlist_grants`` (beat, every 15 minutes): grant pending
  redemptions RevenueCat refused or could not be reached for.
- ``purge_waitlist_after_window`` (beat, daily): once the claim window has
  closed, delete ``waitlist_entries``, the unlinked redemption hashes of
  deleted accounts (decision #13) and any unconfirmed claim. Deleting the
  Resend audience itself is an ops step (``docs/DEPLOYMENT.md``).

From a shell (``backend/``)::

    python -m app.tasks.waitlist_tasks import-csv audience-export.csv
    python -m app.tasks.waitlist_tasks backfill
    python -m app.tasks.waitlist_tasks retry [--older-than-minutes 5]
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Protocol

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.models.database import User, WaitlistEntry, WaitlistRedemption
from app.services.analytics_service import (
    AnalyticsService,
    AnalyticsWriter,
    BufferedAnalyticsBackend,
    DatabaseAnalyticsWriter,
    LogAnalyticsWriter,
)
from app.services.revenuecat_client import RevenueCatClient, get_revenuecat_client
from app.services.waitlist_service import (
    RETRY_AFTER,
    WaitlistService,
    window_has_closed,
    window_is_open,
)
from app.services.waitlist_source import (
    ResendAudienceClient,
    SyncResult,
    WaitlistContact,
    WaitlistSourceError,
    parse_export_csv,
    replace_entries,
)
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AsyncSession]


class AudienceSource(Protocol):
    async def list_contacts(self) -> list[WaitlistContact]: ...


@dataclass
class SyncAndMatchResult:
    synced: bool = False
    added: int = 0
    updated: int = 0
    removed: int = 0
    matched: int = 0


@dataclass
class PurgeResult:
    entries: int = 0
    unlinked_redemptions: int = 0
    claims: int = 0


def get_audience_source() -> AudienceSource | None:
    settings = get_settings()
    if not (settings.resend_waitlist_audience_id and settings.resend_api_key):
        return None
    return ResendAudienceClient(
        api_key=settings.resend_api_key,
        audience_id=settings.resend_waitlist_audience_id,
        base_url=settings.resend_api_base,
    )


def _writer(factory: SessionFactory) -> AnalyticsWriter:
    if get_settings().analytics_storage == "log":
        return LogAnalyticsWriter()
    return DatabaseAnalyticsWriter(factory)  # type: ignore[arg-type]


async def sync_and_match(
    factory: SessionFactory,
    audience: AudienceSource | None,
    revenuecat: RevenueCatClient | None,
) -> SyncAndMatchResult:
    result = SyncAndMatchResult()
    if window_has_closed():
        logger.info("waitlist claim window closed; nothing to sync or match")
        return result
    if audience is not None:
        contacts = await audience.list_contacts()
        async with factory() as db:
            synced = await replace_entries(db, contacts)
            await db.commit()
        result.synced = True
        result.added, result.updated, result.removed = (
            synced.added,
            synced.updated,
            synced.removed,
        )
    if window_is_open():
        backend = BufferedAnalyticsBackend(device_type=None, app_version=None)
        try:
            async with factory() as db:
                result.matched = await WaitlistService(
                    db, AnalyticsService(backend), revenuecat
                ).match_all()
                await db.commit()
        finally:
            await backend.flush(_writer(factory))
    return result


async def retry_pending_grants(
    factory: SessionFactory,
    revenuecat: RevenueCatClient | None,
    older_than: timedelta = RETRY_AFTER,
) -> int:
    backend = BufferedAnalyticsBackend(device_type=None, app_version=None)
    try:
        async with factory() as db:
            return await WaitlistService(
                db, AnalyticsService(backend), revenuecat
            ).retry_pending(older_than)
    finally:
        await backend.flush(_writer(factory))


async def purge_after_window(factory: SessionFactory) -> PurgeResult:
    result = PurgeResult()
    if not window_has_closed():
        return result
    async with factory() as db:
        result.entries = (await db.execute(delete(WaitlistEntry))).rowcount or 0
        result.unlinked_redemptions = (
            await db.execute(
                delete(WaitlistRedemption).where(WaitlistRedemption.user_id.is_(None))
            )
        ).rowcount or 0
        result.claims = (
            await db.execute(
                update(User)
                .where(User.waitlist_claim_token_hash.is_not(None))
                .values(
                    waitlist_claim_email=None,
                    waitlist_claim_token_hash=None,
                    waitlist_claim_expires_at=None,
                )
            )
        ).rowcount or 0
        await db.commit()
    return result


async def import_export(factory: SessionFactory, text: str) -> SyncResult:
    """Replace the waitlist copy with a Resend CSV export."""
    contacts = parse_export_csv(text)
    async with factory() as db:
        result = await replace_entries(db, contacts)
        await db.commit()
    return result


# -- running them --------------------------------------------------------------


async def _with_own_engine(run):
    # A fresh engine per run: asyncio.run gives each run its own event loop,
    # and pooled asyncpg connections cannot cross loops.
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    try:
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        return await run(factory)
    finally:
        await engine.dispose()


@celery_app.task(name="app.tasks.waitlist_tasks.sync_and_match_waitlist")
def sync_and_match_waitlist_task() -> None:
    try:
        result = asyncio.run(
            _with_own_engine(
                lambda f: sync_and_match(
                    f, get_audience_source(), get_revenuecat_client()
                )
            )
        )
    except WaitlistSourceError:
        logger.exception("waitlist sync failed; the copy was left as it was")
        return
    logger.info("waitlist_sync_and_match", extra=result.__dict__)


@celery_app.task(name="app.tasks.waitlist_tasks.retry_waitlist_grants")
def retry_waitlist_grants_task() -> None:
    granted = asyncio.run(
        _with_own_engine(lambda f: retry_pending_grants(f, get_revenuecat_client()))
    )
    if granted:
        logger.info("waitlist grants retried: %d granted", granted)


@celery_app.task(name="app.tasks.waitlist_tasks.purge_waitlist_after_window")
def purge_waitlist_after_window_task() -> None:
    result = asyncio.run(_with_own_engine(purge_after_window))
    if result.entries or result.unlinked_redemptions or result.claims:
        logger.info("waitlist_purged", extra=result.__dict__)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tasks.waitlist_tasks")
    commands = parser.add_subparsers(dest="command", required=True)
    imp = commands.add_parser("import-csv", help="load a Resend audience CSV export")
    imp.add_argument("path", type=Path)
    commands.add_parser("backfill", help="sync the audience and match every account")
    retry = commands.add_parser("retry", help="retry pending RevenueCat grants")
    retry.add_argument("--older-than-minutes", type=float, default=5.0)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    if args.command == "import-csv":
        text = args.path.read_text(encoding="utf-8-sig")
        imported = asyncio.run(_with_own_engine(lambda f: import_export(f, text)))
        print(f"waitlist import: {imported}")
    elif args.command == "retry":
        older = timedelta(minutes=args.older_than_minutes)
        granted = asyncio.run(
            _with_own_engine(
                lambda f: retry_pending_grants(f, get_revenuecat_client(), older)
            )
        )
        print(f"waitlist retry: granted={granted}")
    else:
        result = asyncio.run(
            _with_own_engine(
                lambda f: sync_and_match(
                    f, get_audience_source(), get_revenuecat_client()
                )
            )
        )
        print(f"waitlist backfill: {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
