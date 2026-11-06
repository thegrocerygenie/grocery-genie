"""Canonical item row locks, shared by the services that change an item.

Lock order (DA-5): items first, in id order, then suggestion rows. merge()
and accept_suggestion() lock their two items; muting or unmuting an item
(DA-11) locks its one item and no suggestion, so it waits for a merge of
that item, or the merge waits for it, and no two can wait in a cycle.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import CanonicalItem


class ItemNotFoundError(Exception):
    """No canonical item (or alias, or suggestion) with that id for this user."""


async def lock_items(db: AsyncSession, *item_ids: uuid.UUID) -> set[uuid.UUID]:
    """Lock the item rows in id order; returns the ids still there.

    FOR NO KEY UPDATE: it does not block a confirm linking new lines to the
    item (their foreign keys take KEY SHARE). An item a merge deleted while
    this waited is not returned.
    """
    rows = await db.execute(
        select(CanonicalItem.id)
        .where(CanonicalItem.id.in_(sorted(set(item_ids))))
        .order_by(CanonicalItem.id)
        .with_for_update(key_share=True)
    )
    return set(rows.scalars())
