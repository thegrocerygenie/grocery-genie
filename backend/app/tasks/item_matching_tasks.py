"""Nightly sweep for item matching (PI-02) and price history (PI-01).

Confirming a receipt matches its lines inline (ReceiptService._record_prices).
This picks up what that left:

- lines confirmed before item matching existed: the first run after the V1.1
  deploy backfills every user's price history;
- lines whose matching failed (it runs in a savepoint and never fails the
  confirm);
- aliases saved without an embedding because the model was unavailable.

Each user runs in their own transaction, so one user's failure (say, a
confirm racing the sweep for the same new name) is logged and retried the
next night without holding up the others.
"""

import asyncio
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.llm.provider import Embedder, get_embedder
from app.models.database import CanonicalItemAlias, LineItem, Receipt
from app.services.item_matching_service import ItemMatchingService
from app.services.price_service import PriceService
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@dataclass
class SweepResult:
    users: int = 0
    lines_matched: int = 0
    aliases_embedded: int = 0
    failed_users: int = 0


@celery_app.task(name="app.tasks.item_matching_tasks.match_unmatched_items")
def match_unmatched_items_task() -> None:
    result = asyncio.run(_run_with_own_engine())
    logger.info("item_matching_sweep", extra=result.__dict__)


async def _run_with_own_engine() -> SweepResult:
    # A fresh engine per run: asyncio.run gives each run its own event loop,
    # and pooled asyncpg connections cannot cross loops.
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    try:
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        return await match_unmatched_items(factory, get_embedder())
    finally:
        await engine.dispose()


async def _users_to_sweep(db: AsyncSession, with_embeddings: bool) -> list[uuid.UUID]:
    unmatched = (
        select(Receipt.user_id)
        .join(LineItem, LineItem.receipt_id == Receipt.id)
        .where(Receipt.status == "confirmed", LineItem.canonical_item_id.is_(None))
    )
    users = set((await db.execute(unmatched.distinct())).scalars().all())
    if with_embeddings:
        missing = select(CanonicalItemAlias.user_id).where(
            CanonicalItemAlias.embedding.is_(None)
        )
        users |= set((await db.execute(missing.distinct())).scalars().all())
    return sorted(users)


async def sweep_user(
    db: AsyncSession, user_id: uuid.UUID, embedder: Embedder | None
) -> tuple[int, int]:
    """Match one user's unmatched lines and rebuild those receipts' prices.

    Returns (lines matched, alias embeddings filled in).
    """
    service = ItemMatchingService(db, embedder)
    # Embed first, so the lines below can match the filled-in aliases.
    embedded = await service.embed_missing_aliases(user_id)

    receipts = (
        (
            await db.execute(
                select(Receipt)
                .options(selectinload(Receipt.line_items))
                .join(LineItem, LineItem.receipt_id == Receipt.id)
                .where(
                    Receipt.user_id == user_id,
                    Receipt.status == "confirmed",
                    LineItem.canonical_item_id.is_(None),
                )
                .order_by(Receipt.date, Receipt.created_at)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    unmatched = [
        li for r in receipts for li in r.line_items if li.canonical_item_id is None
    ]
    if unmatched:
        await service.match_line_items(user_id, unmatched)
    prices = PriceService(db)
    for receipt in receipts:
        await prices.sync_receipt(receipt)
    return len(unmatched), embedded


async def match_unmatched_items(
    session_factory: Callable[[], AsyncSession], embedder: Embedder | None
) -> SweepResult:
    result = SweepResult()
    async with session_factory() as db:
        users = await _users_to_sweep(db, with_embeddings=embedder is not None)
    for user_id in users:
        async with session_factory() as db:
            try:
                matched, embedded = await sweep_user(db, user_id, embedder)
                await db.commit()
            except Exception:
                await db.rollback()
                result.failed_users += 1
                logger.exception("Item matching sweep failed for user %s", user_id)
                continue
        result.users += 1
        result.lines_matched += matched
        result.aliases_embedded += embedded
    return result
