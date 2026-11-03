"""Price history (PI-01): what the user paid for each canonical item over time.

Every confirmed line linked to a canonical item has one PriceObservation.
sync_receipt rebuilds a receipt's observations whenever the receipt changes,
so they always match its lines. Reads leave out deleted receipts by joining
receipts, so a deleted receipt's prices disappear and come back on restore.
"""

from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import (
    CanonicalItem,
    CanonicalItemAlias,
    PriceObservation,
    Receipt,
    Store,
)

# PI-01 AC 4: a timeline needs at least this many prices.
MIN_TIMELINE_POINTS = 2
# PI-04 FR: a store needs at least this many prices of an item to be compared.
MIN_COMPARISON_OBSERVATIONS = 2

# Rolling average windows (PI functional requirements). Price change alerts
# compare with the 30-day average; the 7-day one goes along for context.
SHORT_WINDOW_DAYS = 7
LONG_WINDOW_DAYS = 30


@dataclass(frozen=True)
class RollingAverage:
    average: Decimal | None
    count: int


@dataclass(frozen=True)
class ItemSummary:
    item: CanonicalItem
    observation_count: int
    store_count: int
    latest: PriceObservation | None


@dataclass(frozen=True)
class PricePoint:
    observation: PriceObservation
    store_name: str | None


@dataclass(frozen=True)
class PriceHistory:
    item: CanonicalItem
    points: list[PricePoint]
    # The unit and currency most of the item's prices are in; the timeline
    # compares only like with like (edge case: unit price ambiguity).
    unit_of_measure: str | None
    currency: str | None
    store_count: int

    @property
    def timeline_points(self) -> list[PricePoint]:
        return [
            p
            for p in self.points
            if p.observation.unit_of_measure == self.unit_of_measure
            and p.observation.currency == self.currency
        ]

    @property
    def has_timeline(self) -> bool:
        return len(self.timeline_points) >= MIN_TIMELINE_POINTS


@dataclass(frozen=True)
class StorePrice:
    """One store's like-for-like prices of an item (PI-04 AC 2)."""

    store_id: uuid.UUID
    store_name: str
    latest: PriceObservation
    average: Decimal
    observation_count: int


@dataclass(frozen=True)
class StoreComparison:
    item: CanonicalItem
    unit_of_measure: str | None
    currency: str | None
    # Cheapest first by average, then by latest price, then by name.
    stores: list[StorePrice]
    # Stores with like-for-like prices of the item, but fewer than
    # MIN_COMPARISON_OBSERVATIONS of them.
    stores_below_minimum: int


def _series(observations: list[PriceObservation]) -> tuple[str | None, str | None]:
    """The (unit, currency) most of the observations are in, or (None, None)."""
    counts = Counter((obs.unit_of_measure, obs.currency) for obs in observations)
    if not counts:
        return None, None
    return counts.most_common(1)[0][0]


class PriceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def sync_receipt(self, receipt: Receipt) -> None:
        """Rebuild the receipt's observations from its lines.

        Only a confirmed receipt has prices; a line without an item or with
        no quantity records none.
        """
        await self.db.execute(
            delete(PriceObservation).where(PriceObservation.receipt_id == receipt.id)
        )
        if receipt.status != "confirmed":
            return
        for line_item in receipt.line_items:
            quantity = Decimal(str(line_item.quantity or 0))
            if line_item.canonical_item_id is None or quantity <= 0:
                continue
            self.db.add(
                PriceObservation(
                    user_id=receipt.user_id,
                    household_id=receipt.household_id,
                    canonical_item_id=line_item.canonical_item_id,
                    receipt_id=receipt.id,
                    line_item_id=line_item.id,
                    store_id=receipt.store_id,
                    date=receipt.date,
                    unit_price=line_item.unit_price,
                    quantity=quantity,
                    unit_of_measure=line_item.unit_of_measure,
                    currency=receipt.currency,
                )
            )
        await self.db.flush()

    async def rolling_average(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
        *,
        unit_of_measure: str | None,
        currency: str,
        as_of: date,
        days: int,
        exclude_receipt_id: uuid.UUID | None = None,
    ) -> RollingAverage:
        """Mean unit price of the item over the ``days`` up to ``as_of``.

        Only prices in the same unit and currency count (edge case: unit
        price ambiguity). ``exclude_receipt_id`` leaves a receipt out, so a
        new price is compared with the ones before it.
        """
        conditions = [
            *self._visible(user_id),
            PriceObservation.canonical_item_id == item_id,
            PriceObservation.unit_of_measure.is_not_distinct_from(unit_of_measure),
            PriceObservation.currency == currency,
            PriceObservation.date > as_of - timedelta(days=days),
            PriceObservation.date <= as_of,
        ]
        if exclude_receipt_id is not None:
            conditions.append(PriceObservation.receipt_id != exclude_receipt_id)
        prices = (
            (
                await self.db.execute(
                    select(PriceObservation.unit_price)
                    .join(Receipt, PriceObservation.receipt_id == Receipt.id)
                    .where(*conditions)
                )
            )
            .scalars()
            .all()
        )
        if not prices:
            return RollingAverage(average=None, count=0)
        total = sum((Decimal(str(p)) for p in prices), Decimal(0))
        return RollingAverage(average=total / len(prices), count=len(prices))

    def _visible(self, user_id: uuid.UUID) -> tuple:
        """Observations of this user's receipts that are not deleted."""
        return (
            PriceObservation.user_id == user_id,
            Receipt.deleted_at.is_(None),
        )

    async def list_items(
        self,
        user_id: uuid.UUID,
        *,
        query: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[ItemSummary], int]:
        """Items with at least one price, most recently bought first."""
        stats = (
            select(
                PriceObservation.canonical_item_id.label("item_id"),
                func.count(PriceObservation.id).label("observation_count"),
                func.count(func.distinct(PriceObservation.store_id)).label(
                    "store_count"
                ),
                func.max(PriceObservation.date).label("last_date"),
            )
            .join(Receipt, PriceObservation.receipt_id == Receipt.id)
            .where(*self._visible(user_id))
            .group_by(PriceObservation.canonical_item_id)
            .subquery()
        )
        conditions = [CanonicalItem.user_id == user_id]
        if query and query.strip():
            pattern = f"%{query.strip().casefold()}%"
            alias_hit = (
                select(CanonicalItemAlias.id)
                .where(
                    CanonicalItemAlias.canonical_item_id == CanonicalItem.id,
                    CanonicalItemAlias.normalized_name.like(pattern),
                )
                .exists()
            )
            conditions.append(
                or_(func.lower(CanonicalItem.canonical_name).like(pattern), alias_hit)
            )

        base = (
            select(CanonicalItem, stats.c.observation_count, stats.c.store_count)
            .join(stats, stats.c.item_id == CanonicalItem.id)
            .where(*conditions)
        )
        total = await self.db.scalar(select(func.count()).select_from(base.subquery()))
        rows = (
            await self.db.execute(
                base.order_by(stats.c.last_date.desc(), CanonicalItem.canonical_name)
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()

        latest = await self._latest_by_item(user_id, [row[0].id for row in rows])
        summaries = [
            ItemSummary(
                item=item,
                observation_count=int(count),
                store_count=int(stores),
                latest=latest.get(item.id),
            )
            for item, count, stores in rows
        ]
        return summaries, int(total or 0)

    async def _latest_by_item(
        self, user_id: uuid.UUID, item_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, PriceObservation]:
        if not item_ids:
            return {}
        rows = await self.db.execute(
            select(PriceObservation)
            .join(Receipt, PriceObservation.receipt_id == Receipt.id)
            .where(
                *self._visible(user_id),
                PriceObservation.canonical_item_id.in_(item_ids),
            )
            .order_by(PriceObservation.date.desc(), Receipt.created_at.desc())
        )
        latest: dict[uuid.UUID, PriceObservation] = {}
        for observation in rows.scalars():
            latest.setdefault(observation.canonical_item_id, observation)
        return latest

    async def item_stats(
        self, user_id: uuid.UUID, item_id: uuid.UUID
    ) -> tuple[int, int, PriceObservation | None]:
        """(observation count, store count, latest observation) for one item."""
        count, stores = (
            await self.db.execute(
                select(
                    func.count(PriceObservation.id),
                    func.count(func.distinct(PriceObservation.store_id)),
                )
                .join(Receipt, PriceObservation.receipt_id == Receipt.id)
                .where(
                    *self._visible(user_id),
                    PriceObservation.canonical_item_id == item_id,
                )
            )
        ).one()
        latest = (await self._latest_by_item(user_id, [item_id])).get(item_id)
        return int(count), int(stores), latest

    async def history(
        self,
        user_id: uuid.UUID,
        item: CanonicalItem,
        *,
        store_id: uuid.UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> PriceHistory:
        """Every price paid for ``item``, oldest first (PI-01 AC 1)."""
        conditions = [
            *self._visible(user_id),
            PriceObservation.canonical_item_id == item.id,
        ]
        all_rows = (
            await self.db.execute(
                select(PriceObservation, Store.name)
                .join(Receipt, PriceObservation.receipt_id == Receipt.id)
                .outerjoin(Store, PriceObservation.store_id == Store.id)
                .where(*conditions)
                .order_by(PriceObservation.date, Receipt.created_at)
            )
        ).all()

        # The series is the unit and currency most prices are in, over all of
        # the item's prices, so a filter cannot change which one is plotted.
        if all_rows:
            unit, currency = _series([obs for obs, _ in all_rows])
        else:
            unit, currency = item.unit_of_measure, None

        points = [
            PricePoint(observation=obs, store_name=store_name)
            for obs, store_name in all_rows
            if (store_id is None or obs.store_id == store_id)
            and (from_date is None or obs.date >= from_date)
            and (to_date is None or obs.date <= to_date)
        ]
        return PriceHistory(
            item=item,
            points=points,
            unit_of_measure=unit,
            currency=currency,
            store_count=len({p.observation.store_id for p in points}),
        )

    async def compare(self, user_id: uuid.UUID, item: CanonicalItem) -> StoreComparison:
        """Latest and average price of ``item`` at each store (PI-04).

        Only stores on the user's own visible receipts appear (AC 3), only
        prices in the item's main unit and currency count (edge case: unit
        price ambiguity), and a store needs MIN_COMPARISON_OBSERVATIONS of
        them (FR).
        """
        rows = (
            await self.db.execute(
                select(PriceObservation, Store.name)
                .join(Receipt, PriceObservation.receipt_id == Receipt.id)
                .outerjoin(Store, PriceObservation.store_id == Store.id)
                .where(
                    *self._visible(user_id),
                    PriceObservation.canonical_item_id == item.id,
                )
                .order_by(PriceObservation.date, Receipt.created_at)
            )
        ).all()
        if rows:
            unit, currency = _series([obs for obs, _ in rows])
        else:
            unit, currency = item.unit_of_measure, None

        by_store: dict[uuid.UUID, tuple[str, list[PriceObservation]]] = {}
        for obs, store_name in rows:
            if obs.store_id is None or store_name is None:
                continue
            if obs.unit_of_measure != unit or obs.currency != currency:
                continue
            by_store.setdefault(obs.store_id, (store_name, []))[1].append(obs)

        stores: list[StorePrice] = []
        below = 0
        for store_id, (store_name, observations) in by_store.items():
            if len(observations) < MIN_COMPARISON_OBSERVATIONS:
                below += 1
                continue
            total = sum((Decimal(str(o.unit_price)) for o in observations), Decimal())
            stores.append(
                StorePrice(
                    store_id=store_id,
                    store_name=store_name,
                    # Rows are oldest first, so the last is the latest.
                    latest=observations[-1],
                    # "Rounded to the cent" (08-api-contracts.md): half up.
                    average=(total / len(observations)).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    ),
                    observation_count=len(observations),
                )
            )
        stores.sort(
            key=lambda s: (
                s.average,
                Decimal(str(s.latest.unit_price)),
                s.store_name.casefold(),
            )
        )
        return StoreComparison(
            item=item,
            unit_of_measure=unit,
            currency=currency,
            stores=stores,
            stores_below_minimum=below,
        )
