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
  closed (and only with a launch date set), delete ``waitlist_entries``, the
  unlinked redemption hashes of deleted accounts (decision #13), any
  unconfirmed claim, and the Resend audience's contacts (plan: retention,
  decision #11), a page at a time and at most ``MAX_RESEND_DELETES_PER_RUN``
  a run. A rerun picks up where the last stopped; only counts are logged.
- ``send_waitlist_claim`` (enqueued by ``POST .../waitlist-offer/claim``):
  look the email up and send the claim link, so the request shows nothing
  about the waitlist.

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
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Protocol

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core import clock
from app.core.config import get_settings
from app.models.database import (
    User,
    WaitlistAudiencePurge,
    WaitlistEntry,
    WaitlistRedemption,
)
from app.services.analytics_service import (
    AnalyticsService,
    AnalyticsWriter,
    BufferedAnalyticsBackend,
    DatabaseAnalyticsWriter,
    LogAnalyticsWriter,
)
from app.services.revenuecat_client import RevenueCatClient, get_revenuecat_client
from app.services.waitlist_service import (
    WaitlistService,
    window_has_closed,
    window_is_open,
)
from app.services.waitlist_source import (
    PAGE_SIZE,
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


class AudienceAdmin(Protocol):
    async def list_contact_ids(self, limit: int) -> list[str]: ...

    async def delete_contact(self, contact_id: str) -> bool: ...


# Resend allows a few requests a second; 2,000 deletes is about 20 minutes.
# The daily run continues where this one stopped.
MAX_RESEND_DELETES_PER_RUN = 2000


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
    resend_contacts_deleted: int = 0
    resend_failed: bool = False
    # The audience was found empty (now or on an earlier run): Resend is
    # no longer called.
    resend_purge_complete: bool = False


def get_audience_source() -> ResendAudienceClient | None:
    """The Resend audience client: reads contacts, and deletes them once the
    window has closed. Its key is GG_RESEND_AUDIENCE_API_KEY (full access),
    else GG_RESEND_API_KEY."""
    settings = get_settings()
    api_key = settings.resend_audience_api_key or settings.resend_api_key
    if not (settings.resend_waitlist_audience_id and api_key):
        return None
    return ResendAudienceClient(
        api_key=api_key,
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
    older_than: timedelta | None = None,
) -> int:
    backend = BufferedAnalyticsBackend(device_type=None, app_version=None)
    try:
        async with factory() as db:
            return await WaitlistService(
                db, AnalyticsService(backend), revenuecat
            ).retry_pending(older_than)
    finally:
        await backend.flush(_writer(factory))


async def purge_after_window(
    factory: SessionFactory,
    audience: AudienceAdmin | None = None,
    *,
    page_size: int = PAGE_SIZE,
    max_deletes: int = MAX_RESEND_DELETES_PER_RUN,
) -> PurgeResult:
    """Once the claim window has closed: the backend's copy first (one
    commit), then the Resend audience's contacts. Safe to rerun: each step
    deletes only what is still there, and a Resend failure stops the run
    without undoing the rest; the next daily run continues."""
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
    if audience is not None:
        async with factory() as db:
            done = await db.get(WaitlistAudiencePurge, 1)
            if done is not None:
                result.resend_purge_complete = True
            elif await _delete_audience_contacts(
                audience, result, page_size, max_deletes
            ):
                db.add(WaitlistAudiencePurge(id=1, completed_at=clock.now()))
                await db.commit()
                result.resend_purge_complete = True
                logger.info("resend audience purge complete; it stops here")
    if (
        result.entries
        or result.unlinked_redemptions
        or result.claims
        or result.resend_contacts_deleted
        or result.resend_failed
    ):
        # Counts only: never an email or a contact id.
        logger.info(
            "waitlist purged: entries=%d unlinked_redemptions=%d claims=%d "
            "resend_contacts_deleted=%d resend_failed=%s",
            result.entries,
            result.unlinked_redemptions,
            result.claims,
            result.resend_contacts_deleted,
            result.resend_failed,
        )
    return result


async def _delete_audience_contacts(
    audience: AudienceAdmin, result: PurgeResult, page_size: int, max_deletes: int
) -> bool:
    """Delete the first page of contacts, then ask again, until none are
    left or ``max_deletes`` is reached. True when Resend listed none: the
    audience is empty. A contact that keeps coming back (Resend still lists
    it after a delete) ends the run instead of looping."""
    tried: set[str] = set()
    try:
        while result.resend_contacts_deleted < max_deletes:
            limit = min(page_size, max_deletes - result.resend_contacts_deleted)
            listed = await audience.list_contact_ids(limit)
            if not listed:
                return True
            fresh = [cid for cid in listed if cid not in tried]
            if not fresh:
                return False
            for contact_id in fresh:
                tried.add(contact_id)
                if await audience.delete_contact(contact_id):
                    result.resend_contacts_deleted += 1
    except WaitlistSourceError:
        result.resend_failed = True
        logger.warning(
            "resend audience purge stopped after %d deletes; the next run continues",
            result.resend_contacts_deleted,
        )
    return False


async def deliver_claim_link(
    factory: SessionFactory, user_id: uuid.UUID, email: str
) -> bool:
    """The claim task's work: send the link if the email qualifies. Never
    raises for a failed send; never logs the email."""
    async with factory() as db:
        return await WaitlistService(db).send_claim_link(user_id, email)


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
    asyncio.run(
        _with_own_engine(lambda f: purge_after_window(f, get_audience_source()))
    )


@celery_app.task(name="app.tasks.waitlist_tasks.send_waitlist_claim")
def send_waitlist_claim_task(user_id: str, email: str) -> None:
    asyncio.run(
        _with_own_engine(lambda f: deliver_claim_link(f, uuid.UUID(user_id), email))
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tasks.waitlist_tasks")
    commands = parser.add_subparsers(dest="command", required=True)
    imp = commands.add_parser("import-csv", help="load a Resend audience CSV export")
    imp.add_argument("path", type=Path)
    commands.add_parser("backfill", help="sync the audience and match every account")
    retry = commands.add_parser("retry", help="retry pending RevenueCat grants")
    retry.add_argument(
        "--older-than-minutes",
        type=float,
        default=None,
        help="retry rows whose last attempt is this old (default: the backoff)",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    if args.command == "import-csv":
        text = args.path.read_text(encoding="utf-8-sig")
        imported = asyncio.run(_with_own_engine(lambda f: import_export(f, text)))
        print(f"waitlist import: {imported}")
    elif args.command == "retry":
        older = (
            None
            if args.older_than_minutes is None
            else timedelta(minutes=args.older_than_minutes)
        )
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
