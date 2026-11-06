"""Price history (PI-01): what the user paid for each canonical item over time.

Every confirmed line linked to a canonical item has one PriceObservation.
sync_receipt rebuilds a receipt's observations whenever the receipt changes,
so they always match its lines. Reads leave out deleted receipts by joining
receipts, so a deleted receipt's prices disappear and come back on restore.

Prices group by store as the user sees stores (store_service.groups): every
branch of one normalized name, and the stores the user merged, are one store
in store counts, history and comparison (EC Price Intelligence 1).
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
    LineItem,
    PriceObservation,
    Receipt,
)
from app.services.store_service import StoreGroup, StoreService

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
    # PI-02 AC 15 (DA-6): the like-for-like mean (_average).
    average: Decimal | None = None


@dataclass(frozen=True)
class ItemStats:
    purchase_count: int
    store_count: int
    average: Decimal | None
    unit_of_measure: str | None
    currency: str | None


@dataclass(frozen=True)
class PricePoint:
    observation: PriceObservation
    # The store as the user groups it; None when the receipt has no store.
    store: StoreGroup | None

    @property
    def store_id(self) -> uuid.UUID | None:
        return self.store.id if self.store else None

    @property
    def store_name(self) -> str | None:
        return self.store.name if self.store else None


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


def _average(
    observations: list[PriceObservation],
) -> tuple[Decimal | None, str | None, str | None]:
    """(mean unit price, unit, currency) of the prices in the unit and
    currency most of them are in, to the cent (half up); no prices: None."""
    unit, currency = _series(observations)
    alike = [
        Decimal(str(o.unit_price))
        for o in observations
        if (o.unit_of_measure, o.currency) == (unit, currency)
    ]
    if not alike:
        return None, unit, currency
    mean = (sum(alike, Decimal()) / len(alike)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return mean, unit, currency


class PriceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def sync_receipt(self, receipt: Receipt) -> None:
        """Rebuild the receipt's observations from its lines.

        Only a confirmed receipt has prices; a line without an item or with
        no quantity records none.

        Each price goes on its line's item as it is now, read again here: a
        split or merge may have moved the line since the caller loaded it. A
        receipt edit locks its lines' items before it changes anything
        (ItemMatchingService.lock_line_items), so no line moves again before
        it commits. Locking them here instead, after the edit has written its
        lines, would wait for an item while holding a line, against the lock
        order: a deadlock with a split or merge.
        """
        line_items = (
            (
                await self.db.execute(
                    select(LineItem)
                    .where(LineItem.receipt_id == receipt.id)
                    .order_by(LineItem.position)
                    .execution_options(populate_existing=True)
                )
            )
            .scalars()
            .all()
        )
        await self.db.execute(
            delete(PriceObservation).where(PriceObservation.receipt_id == receipt.id)
        )
        if receipt.status != "confirmed":
            return
        for line_item in line_items:
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

    async def recent_prices(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
        *,
        unit_of_measure: str | None,
        currency: str,
        as_of: date,
        limit: int,
        exclude_receipt_id: uuid.UUID | None = None,
    ) -> list[Decimal]:
        """The item's last ``limit`` like-for-like prices up to ``as_of``,
        oldest first: the sparkline of a price alert (PI-03 AC 5)."""
        conditions = [
            *self._visible(user_id),
            PriceObservation.canonical_item_id == item_id,
            PriceObservation.unit_of_measure.is_not_distinct_from(unit_of_measure),
            PriceObservation.currency == currency,
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
                    .order_by(
                        PriceObservation.date.desc(),
                        Receipt.created_at.desc(),
                        PriceObservation.id.desc(),
                    )
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return [Decimal(str(p)) for p in reversed(prices)]

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
            select(CanonicalItem, stats.c.observation_count)
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

        item_ids = [row[0].id for row in rows]
        latest = await self._latest_by_item(user_id, item_ids)
        store_counts = await self._store_counts(user_id, item_ids)
        averages = await self.averages(user_id, item_ids)
        summaries = [
            ItemSummary(
                item=item,
                observation_count=int(count),
                store_count=store_counts.get(item.id, 0),
                latest=latest.get(item.id),
                average=averages.get(item.id),
            )
            for item, count in rows
        ]
        return summaries, int(total or 0)

    async def averages(
        self, user_id: uuid.UUID, item_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, Decimal | None]:
        """Each item's like-for-like mean unit price (_average), in one read."""
        if not item_ids:
            return {}
        rows = await self.db.execute(
            select(PriceObservation)
            .join(Receipt, PriceObservation.receipt_id == Receipt.id)
            .where(
                *self._visible(user_id),
                PriceObservation.canonical_item_id.in_(item_ids),
            )
        )
        by_item: dict[uuid.UUID, list[PriceObservation]] = {}
        for observation in rows.scalars():
            by_item.setdefault(observation.canonical_item_id, []).append(observation)
        return {item_id: _average(obs)[0] for item_id, obs in by_item.items()}

    async def line_names(self, line_item_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
        """The receipt name of each line (PI-02 AC 10: the split screen)."""
        if not line_item_ids:
            return {}
        rows = await self.db.execute(
            select(LineItem.id, LineItem.raw_name).where(LineItem.id.in_(line_item_ids))
        )
        return {line_id: name for line_id, name in rows.all()}

    async def _store_counts(
        self, user_id: uuid.UUID, item_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """How many stores, as the user groups them, each item has prices from."""
        if not item_ids:
            return {}
        pairs = (
            await self.db.execute(
                select(PriceObservation.canonical_item_id, PriceObservation.store_id)
                .join(Receipt, PriceObservation.receipt_id == Receipt.id)
                .where(
                    *self._visible(user_id),
                    PriceObservation.canonical_item_id.in_(item_ids),
                    PriceObservation.store_id.is_not(None),
                )
                .distinct()
            )
        ).all()
        groups = await StoreService(self.db).groups(user_id, {s for _, s in pairs})
        seen: dict[uuid.UUID, set[uuid.UUID]] = {}
        for item_id, store_id in pairs:
            group = groups.get(store_id)
            if group is not None:
                seen.setdefault(item_id, set()).add(group.id)
        return {item_id: len(ids) for item_id, ids in seen.items()}

    async def _observations(
        self, user_id: uuid.UUID, item_id: uuid.UUID
    ) -> tuple[list[PriceObservation], dict[uuid.UUID, StoreGroup]]:
        """The item's visible prices, oldest first, and their stores' groups."""
        observations = list(
            (
                await self.db.execute(
                    select(PriceObservation)
                    .join(Receipt, PriceObservation.receipt_id == Receipt.id)
                    .where(
                        *self._visible(user_id),
                        PriceObservation.canonical_item_id == item_id,
                    )
                    .order_by(PriceObservation.date, Receipt.created_at)
                )
            ).scalars()
        )
        groups = await StoreService(self.db).groups(
            user_id, {o.store_id for o in observations}
        )
        return observations, groups

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
        count = await self.db.scalar(
            select(func.count(PriceObservation.id))
            .join(Receipt, PriceObservation.receipt_id == Receipt.id)
            .where(
                *self._visible(user_id),
                PriceObservation.canonical_item_id == item_id,
            )
        )
        stores = (await self._store_counts(user_id, [item_id])).get(item_id, 0)
        latest = (await self._latest_by_item(user_id, [item_id])).get(item_id)
        return int(count or 0), stores, latest

    async def purchase_stats(self, user_id: uuid.UUID, item_id: uuid.UUID) -> ItemStats:
        """The "Existing item" card of the match prompt (PI-02 AC 5): the
        user's purchases of the item, their stores, and the mean unit price
        of the prices in the unit and currency most of them are in."""
        observations, _ = await self._observations(user_id, item_id)
        stores = (await self._store_counts(user_id, [item_id])).get(item_id, 0)
        average, unit, currency = _average(observations)
        return ItemStats(len(observations), stores, average, unit, currency)

    async def history(
        self,
        user_id: uuid.UUID,
        item: CanonicalItem,
        *,
        store_id: uuid.UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> PriceHistory:
        """Every price paid for ``item``, oldest first (PI-01 AC 1).

        Each point names its store's group; filtering by any store of a group
        gives the whole group.
        """
        observations, groups = await self._observations(user_id, item.id)

        # The series is the unit and currency most prices are in, over all of
        # the item's prices, so a filter cannot change which one is plotted.
        if observations:
            unit, currency = _series(observations)
        else:
            unit, currency = item.unit_of_measure, None

        wanted: uuid.UUID | None = None
        if store_id is not None:
            filter_group = (
                await StoreService(self.db).groups(user_id, [store_id])
            ).get(store_id)
            wanted = filter_group.id if filter_group else store_id

        points: list[PricePoint] = []
        for obs in observations:
            group = groups.get(obs.store_id) if obs.store_id else None
            if wanted is not None and (group is None or group.id != wanted):
                continue
            if from_date is not None and obs.date < from_date:
                continue
            if to_date is not None and obs.date > to_date:
                continue
            points.append(PricePoint(observation=obs, store=group))
        return PriceHistory(
            item=item,
            points=points,
            unit_of_measure=unit,
            currency=currency,
            store_count=len({p.store.id for p in points if p.store is not None}),
        )

    async def compare(self, user_id: uuid.UUID, item: CanonicalItem) -> StoreComparison:
        """Latest and average price of ``item`` at each store (PI-04).

        Only stores on the user's own visible receipts appear (AC 3), only
        prices in the item's main unit and currency count (edge case: unit
        price ambiguity), and a store needs MIN_COMPARISON_OBSERVATIONS of
        them (FR).
        """
        observations, groups = await self._observations(user_id, item.id)
        if observations:
            unit, currency = _series(observations)
        else:
            unit, currency = item.unit_of_measure, None

        # Keyed by store group: the user's merged stores are one store.
        by_store: dict[uuid.UUID, tuple[str, list[PriceObservation]]] = {}
        for obs in observations:
            group = groups.get(obs.store_id) if obs.store_id else None
            if group is None:
                continue
            if obs.unit_of_measure != unit or obs.currency != currency:
                continue
            by_store.setdefault(group.id, (group.name, []))[1].append(obs)

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
