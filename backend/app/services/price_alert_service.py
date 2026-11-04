"""Price change alerts (PI-03).

When a receipt is confirmed, each of its prices is compared with the item's
30-day rolling average: earlier prices of the same item in the same unit and
currency. A change of at least the user's threshold (10% by default) is a
PriceChangeDetected, unless the item or the store is muted or alerts are off.
claim() then lets each item alert at most once per cooldown (7 days by
default), and the caller writes the notification in the same transaction.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.money import format_money
from app.events.types import PriceChangeDetected
from app.models.database import (
    CanonicalItem,
    PriceAlertItemMute,
    PriceAlertSent,
    PriceAlertStoreMute,
    PriceObservation,
    Receipt,
    User,
)
from app.services.price_service import (
    LONG_WINDOW_DAYS,
    SHORT_WINDOW_DAYS,
    PriceService,
)
from app.services.store_service import StoreGroup, StoreService

NOTIFICATION_TYPE = "price_change"

# Units that are a count, not a measure: "$0.78" rather than "$0.78/each".
_COUNT_UNITS = {"each", "ea", "unit", "units", "item", "items", "pc", "pcs"}


@dataclass(frozen=True)
class PriceAlertSettings:
    enabled: bool
    threshold_percent: int
    default_threshold_percent: int
    cooldown_days: int
    muted_items: list[CanonicalItem]
    # One entry per muted store group, as the user's merges group stores.
    muted_stores: list[StoreGroup]


@dataclass(frozen=True)
class PriceAlert:
    event: PriceChangeDetected
    title: str
    body: str
    data: dict


def _insert(db: AsyncSession):
    return pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert


def _price_text(amount: Decimal, currency: str, unit: str | None) -> str:
    text = format_money(float(amount), currency)
    if unit and unit.strip().casefold() not in _COUNT_UNITS:
        text += f"/{unit.strip()}"
    return text


class PriceAlertService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # --- settings and mutes -----------------------------------------------

    async def get_settings(self, user: User) -> PriceAlertSettings:
        default = get_settings().price_alert_threshold_percent
        muted_items = (
            (
                await self.db.execute(
                    select(CanonicalItem)
                    .join(
                        PriceAlertItemMute,
                        PriceAlertItemMute.canonical_item_id == CanonicalItem.id,
                    )
                    .where(PriceAlertItemMute.user_id == user.id)
                    .order_by(CanonicalItem.canonical_name)
                )
            )
            .scalars()
            .all()
        )
        groups = await self._muted_groups(user.id)
        muted_stores = sorted(
            {g.id: g for g in groups.values()}.values(),
            key=lambda g: (g.name.casefold(), str(g.id)),
        )
        return PriceAlertSettings(
            enabled=user.price_alerts_enabled,
            threshold_percent=user.price_alert_threshold_percent or default,
            default_threshold_percent=default,
            cooldown_days=get_settings().price_alert_cooldown_days,
            muted_items=list(muted_items),
            muted_stores=list(muted_stores),
        )

    async def update_settings(self, user: User, changes: dict) -> PriceAlertSettings:
        """Apply the fields the request set. A null threshold is the default."""
        if "enabled" in changes and changes["enabled"] is not None:
            user.price_alerts_enabled = changes["enabled"]
        if "threshold_percent" in changes:
            user.price_alert_threshold_percent = changes["threshold_percent"]
        await self.db.flush()
        return await self.get_settings(user)

    async def mute_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
        await self.db.execute(
            _insert(self.db)(PriceAlertItemMute)
            .values(id=uuid.uuid4(), user_id=user_id, canonical_item_id=item_id)
            .on_conflict_do_nothing(index_elements=["user_id", "canonical_item_id"])
        )

    async def unmute_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(PriceAlertItemMute).where(
                PriceAlertItemMute.user_id == user_id,
                PriceAlertItemMute.canonical_item_id == item_id,
            )
        )

    # A store mute covers the store's whole group as the user sees it (their
    # merges, and every branch of one normalized name). It is recorded on the
    # group's root at the time of muting; a mute recorded on a store later
    # merged into another mutes the merged group. Unmerging leaves each mute
    # on the store it was recorded on.

    async def _muted_groups(self, user_id: uuid.UUID) -> dict[uuid.UUID, StoreGroup]:
        """Each of the user's mute rows' store id -> its group."""
        muted_ids = (
            (
                await self.db.execute(
                    select(PriceAlertStoreMute.store_id).where(
                        PriceAlertStoreMute.user_id == user_id
                    )
                )
            )
            .scalars()
            .all()
        )
        return await StoreService(self.db).groups(user_id, muted_ids)

    async def mute_store(self, user_id: uuid.UUID, store_id: uuid.UUID) -> None:
        """Stores are shared: a user may mute only one they have a receipt from."""
        stores = StoreService(self.db)
        await stores.check_shopped(user_id, store_id)
        group = (await stores.groups(user_id, [store_id]))[store_id]
        await self.db.execute(
            _insert(self.db)(PriceAlertStoreMute)
            .values(id=uuid.uuid4(), user_id=user_id, store_id=group.id)
            .on_conflict_do_nothing(index_elements=["user_id", "store_id"])
        )

    async def unmute_store(self, user_id: uuid.UUID, store_id: uuid.UUID) -> None:
        """Delete the user's own mutes on the store's group, if any. No store
        check: the mute outlives the user's receipts from the store (deleted,
        then purged), and settings still lists it, so it must stay removable."""
        target = (await StoreService(self.db).groups(user_id, [store_id])).get(store_id)
        ids = {store_id}
        if target is not None:
            ids |= {
                muted_id
                for muted_id, group in (await self._muted_groups(user_id)).items()
                if group.id == target.id
            }
        await self.db.execute(
            delete(PriceAlertStoreMute).where(
                PriceAlertStoreMute.user_id == user_id,
                PriceAlertStoreMute.store_id.in_(ids),
            )
        )

    async def is_item_muted(self, user_id: uuid.UUID, item_id: uuid.UUID) -> bool:
        return (
            await self.db.scalar(
                select(PriceAlertItemMute.id).where(
                    PriceAlertItemMute.user_id == user_id,
                    PriceAlertItemMute.canonical_item_id == item_id,
                )
            )
        ) is not None

    # --- detection --------------------------------------------------------

    async def detect(self, receipt: Receipt) -> list[PriceAlert]:
        """Alerts the receipt's prices call for, before the cooldown claim.

        Ordered by item id, so claims take ledger row locks in one order and
        two concurrent confirms cannot deadlock on them.
        """
        user = await self.db.get(User, receipt.user_id)
        if user is None or not user.price_alerts_enabled:
            return []
        if receipt.store_id is not None and await self._store_muted(
            user.id, receipt.store_id
        ):
            return []
        threshold = Decimal(
            user.price_alert_threshold_percent
            or get_settings().price_alert_threshold_percent
        )
        min_count = get_settings().price_alert_min_observations

        observations = (
            (
                await self.db.execute(
                    select(PriceObservation).where(
                        PriceObservation.receipt_id == receipt.id
                    )
                )
            )
            .scalars()
            .all()
        )
        # Two lines of one item on one receipt are one price: their mean.
        grouped: dict[tuple, list[Decimal]] = defaultdict(list)
        for obs in observations:
            key = (obs.canonical_item_id, obs.unit_of_measure, obs.currency)
            grouped[key].append(Decimal(str(obs.unit_price)))

        muted = await self._muted_items(user.id, {k[0] for k in grouped})
        store_name = await self._store_name(user.id, receipt.store_id)
        prices = PriceService(self.db)
        alerts: list[PriceAlert] = []
        seen_items: set[uuid.UUID] = set()
        for (item_id, unit, currency), unit_prices in sorted(
            grouped.items(), key=lambda kv: str(kv[0][0])
        ):
            if item_id in muted or item_id in seen_items:
                continue
            window = {
                "unit_of_measure": unit,
                "currency": currency,
                "as_of": receipt.date,
                "exclude_receipt_id": receipt.id,
            }
            long = await prices.rolling_average(
                user.id, item_id, days=LONG_WINDOW_DAYS, **window
            )
            if long.average is None or long.count < min_count or long.average <= 0:
                continue
            new_price = sum(unit_prices, Decimal(0)) / len(unit_prices)
            change = (new_price - long.average) / long.average * 100
            if abs(change) < threshold:
                continue
            short = await prices.rolling_average(
                user.id, item_id, days=SHORT_WINDOW_DAYS, **window
            )
            seen_items.add(item_id)
            item = await self.db.get(CanonicalItem, item_id)
            event = PriceChangeDetected(
                user_id=user.id,
                canonical_item_id=item_id,
                store_id=receipt.store_id,
                receipt_id=receipt.id,
                old_avg=float(long.average),
                new_price=float(new_price),
                percent_change=float(change),
                currency=currency,
                unit_of_measure=unit,
                avg_7d=float(short.average) if short.average is not None else None,
            )
            alerts.append(
                self._alert(
                    event,
                    item.canonical_name if item else "An item",
                    store_name,
                    long.average,
                    new_price,
                    change,
                )
            )
        return alerts

    def _alert(
        self,
        event: PriceChangeDetected,
        item_name: str,
        store_name: str | None,
        average: Decimal,
        new_price: Decimal,
        change: Decimal,
    ) -> PriceAlert:
        percent = int(abs(change).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        direction = "up" if change > 0 else "down"
        new_text = _price_text(new_price, event.currency, event.unit_of_measure)
        old_text = _price_text(average, event.currency, event.unit_of_measure)
        where = f" at {store_name}" if store_name else ""
        title = f"{item_name} price {direction} {percent}%"
        body = (
            f"{item_name}: {new_text}{where}, {direction} {percent}% from your "
            f"30-day average of {old_text}."
        )
        return PriceAlert(
            event=event,
            title=title[:255],
            body=body,
            data={
                "canonical_item_id": str(event.canonical_item_id),
                "store_id": str(event.store_id) if event.store_id else None,
            },
        )

    async def claim(
        self, user_id: uuid.UUID, item_id: uuid.UUID, now: datetime
    ) -> bool:
        """Record an alert for the item now, unless one was sent in the cooldown.

        One upsert on the item's unique ledger row: it inserts the row, or
        moves alerted_at when the last alert is a cooldown old, and otherwise
        changes nothing and returns False. A concurrent claim for the same item
        waits on the row lock and then sees the new alerted_at, so two
        confirms cannot both alert.
        """
        cutoff = now - timedelta(days=get_settings().price_alert_cooldown_days)
        insert = _insert(self.db)
        statement = insert(PriceAlertSent).values(
            id=uuid.uuid4(),
            user_id=user_id,
            canonical_item_id=item_id,
            alerted_at=now,
        )
        result = await self.db.execute(
            statement.on_conflict_do_update(
                index_elements=["canonical_item_id"],
                set_={"alerted_at": statement.excluded.alerted_at},
                where=PriceAlertSent.alerted_at <= cutoff,
            ).returning(PriceAlertSent.id)
        )
        return result.scalar_one_or_none() is not None

    async def _muted_items(
        self, user_id: uuid.UUID, item_ids: set[uuid.UUID]
    ) -> set[uuid.UUID]:
        if not item_ids:
            return set()
        rows = await self.db.execute(
            select(PriceAlertItemMute.canonical_item_id).where(
                PriceAlertItemMute.user_id == user_id,
                PriceAlertItemMute.canonical_item_id.in_(item_ids),
            )
        )
        return set(rows.scalars().all())

    async def _store_muted(self, user_id: uuid.UUID, store_id: uuid.UUID) -> bool:
        """Whether the user muted the store's group (see the mute notes)."""
        muted = await self._muted_groups(user_id)
        if not muted:
            return False
        group = (await StoreService(self.db).groups(user_id, [store_id])).get(store_id)
        if group is None:
            return False
        return any(g.id == group.id for g in muted.values())

    async def _store_name(
        self, user_id: uuid.UUID, store_id: uuid.UUID | None
    ) -> str | None:
        """The store as the user's prices group it (their merges)."""
        if store_id is None:
            return None
        group = (await StoreService(self.db).groups(user_id, [store_id])).get(store_id)
        return group.name if group else None
