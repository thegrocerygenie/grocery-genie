"""The nightly item-matching sweep: backfill, retry, missing embeddings."""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.llm.provider import MockEmbedder
from app.models.database import (
    CanonicalItem,
    CanonicalItemAlias,
    LineItem,
    PriceObservation,
    Receipt,
)
from app.tasks.item_matching_tasks import match_unmatched_items
from tests.conftest import ensure_user

USER = uuid.UUID("00000000-0000-0000-0000-0000000000b1")
OTHER = uuid.UUID("00000000-0000-0000-0000-0000000000b2")


@pytest.fixture
def factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


async def _confirmed_receipt(factory, user_id, day, *names, status="confirmed"):
    """A receipt confirmed before matching existed: lines with no item."""
    async with factory() as db:
        await ensure_user(db, user_id)
        receipt = Receipt(user_id=user_id, date=day, status=status, currency="USD")
        db.add(receipt)
        await db.flush()
        for position, name in enumerate(names):
            db.add(
                LineItem(
                    receipt_id=receipt.id,
                    raw_name=name,
                    position=position,
                    quantity=1,
                    unit_price=1.5,
                    total_price=1.5,
                )
            )
        await db.commit()
        return receipt.id


async def _scalar(factory, query):
    async with factory() as db:
        return await db.scalar(query)


async def test_backfills_price_history_for_receipts_confirmed_before_v11(factory):
    await _confirmed_receipt(factory, USER, date(2026, 2, 1), "Avocado", "Limes")
    await _confirmed_receipt(factory, USER, date(2026, 3, 1), "AVOCADO")
    await _confirmed_receipt(factory, OTHER, date(2026, 3, 1), "Avocado")

    result = await match_unmatched_items(factory, MockEmbedder())

    assert result.users == 2
    assert result.lines_matched == 4
    assert result.failed_users == 0
    unmatched = await _scalar(
        factory,
        select(func.count(LineItem.id)).where(LineItem.canonical_item_id.is_(None)),
    )
    assert unmatched == 0
    # One avocado item for USER with both prices, one for OTHER.
    async with factory() as db:
        rows = (
            await db.execute(
                select(PriceObservation.user_id, PriceObservation.canonical_item_id)
            )
        ).all()
    assert len(rows) == 4
    user_items = {item for user, item in rows if user == USER}
    assert len(user_items) == 2  # avocado, limes


async def test_running_twice_changes_nothing(factory):
    await _confirmed_receipt(factory, USER, date(2026, 2, 1), "Avocado")
    await match_unmatched_items(factory, MockEmbedder())

    again = await match_unmatched_items(factory, MockEmbedder())

    assert again.users == 0
    assert await _scalar(factory, select(func.count(CanonicalItem.id))) == 1
    assert await _scalar(factory, select(func.count(PriceObservation.id))) == 1


async def test_unconfirmed_receipts_are_left_alone(factory):
    await _confirmed_receipt(
        factory, USER, date(2026, 2, 1), "Avocado", status="pending_review"
    )

    result = await match_unmatched_items(factory, MockEmbedder())

    assert result.users == 0
    assert await _scalar(factory, select(func.count(CanonicalItem.id))) == 0


async def test_fills_in_missing_alias_embeddings(factory):
    await _confirmed_receipt(factory, USER, date(2026, 2, 1), "Avocado")
    await match_unmatched_items(factory, None)  # the model was unavailable
    assert (
        await _scalar(
            factory,
            select(func.count(CanonicalItemAlias.id)).where(
                CanonicalItemAlias.embedding.is_(None)
            ),
        )
        == 1
    )

    result = await match_unmatched_items(factory, MockEmbedder())

    assert result.aliases_embedded == 1
    assert (
        await _scalar(
            factory,
            select(func.count(CanonicalItemAlias.id)).where(
                CanonicalItemAlias.embedding.is_(None)
            ),
        )
        == 0
    )


async def test_one_users_failure_does_not_stop_the_others(factory, monkeypatch):
    from app.tasks import item_matching_tasks

    await _confirmed_receipt(factory, USER, date(2026, 2, 1), "Avocado")
    await _confirmed_receipt(factory, OTHER, date(2026, 2, 1), "Avocado")
    real_sweep = item_matching_tasks.sweep_user

    async def flaky(db, user_id, embedder):
        if user_id == USER:
            raise RuntimeError("boom")
        return await real_sweep(db, user_id, embedder)

    monkeypatch.setattr(item_matching_tasks, "sweep_user", flaky)

    result = await match_unmatched_items(factory, MockEmbedder())

    assert result.failed_users == 1
    assert result.users == 1
    still_unmatched = await _scalar(
        factory,
        select(func.count(LineItem.id))
        .join(Receipt)
        .where(Receipt.user_id == USER, LineItem.canonical_item_id.is_(None)),
    )
    assert still_unmatched == 1


def test_sweep_runs_nightly_on_beat():
    from app.tasks.celery_app import celery_app

    celery_app.loader.import_default_modules()
    tasks = {entry["task"] for entry in celery_app.conf.beat_schedule.values()}

    assert "app.tasks.item_matching_tasks.match_unmatched_items" in tasks
    assert "app.tasks.item_matching_tasks.match_unmatched_items" in celery_app.tasks
