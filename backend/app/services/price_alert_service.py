"""Price change alerts (PI-03).

When a receipt is confirmed, each of its prices is compared with the item's
30-day rolling average: earlier prices of the same item in the same unit and
currency. A change of at least the user's threshold (10% by default) is a
PriceChangeDetected, unless the item or the store is muted or alerts are off.
A mute may end (PI-03 AC 11, DA-7): it is live while its ``muted_until`` is
null (forever) or later than the confirm's server time, so an ended one needs
no job to end it and counts as unmuted from that instant (AC 12). Times are
compared in UTC: SQLite keeps no offset, so every time written is UTC first.
claim() then lets each item alert at most once per the user's cooldown (7
days by default, PI-03 AC 8), and the caller writes the notification in the
same transaction.

The copy follows the design (PI-03 AC 9): "<Item> up 20%", "<Item> at
<Store>: was $0.65/lb avg, now $0.78/lb", and a drop adds "stock-up worth
it". The push and the in-app Price alerts list both read the notification's
title and body; its data carries the parts a list row shows (AC 5).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import ColumnElement, delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
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
from app.services.item_locks import ItemNotFoundError, lock_items
from app.services.price_service import (
    LONG_WINDOW_DAYS,
    SHORT_WINDOW_DAYS,
    PriceService,
)
from app.services.store_service import StoreGroup, StoreService

NOTIFICATION_TYPE = "price_change"
STOCK_UP = "stock-up worth it"
# Prices on a list row's sparkline: the alerted one and up to 7 before it.
SPARKLINE_PRICES = 8

# Units that are a count, not a measure: "$0.78" rather than "$0.78/each".
_COUNT_UNITS = {"each", "ea", "unit", "units", "item", "items", "pc", "pcs"}


@dataclass(frozen=True)
class MutedItem:
    item: CanonicalItem
    # When the mute ends (UTC), or None for forever.
    muted_until: datetime | None


@dataclass(frozen=True)
class MutedStore:
    group: StoreGroup
    muted_until: datetime | None


@dataclass(frozen=True)
class PriceAlertSettings:
    enabled: bool
    threshold_percent: int
    default_threshold_percent: int
    cooldown_days: int
    default_cooldown_days: int
    # Live mutes only: an ended one is not listed (PI-03 AC 12).
    muted_items: list[MutedItem]
    # One entry per muted store group, as the user's merges group stores.
    muted_stores: list[MutedStore]


@dataclass(frozen=True)
class PriceAlert:
    event: PriceChangeDetected
    title: str
    body: str
    data: dict


def _insert(db: AsyncSession):
    return pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert


def utc(value: datetime | None) -> datetime | None:
    """A stored time as aware UTC: SQLite gives it back naive (it was written
    in UTC), Postgres aware."""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def live(muted_until: ColumnElement, now: datetime) -> ColumnElement[bool]:
    """A mute is live while it has no end, or ends after ``now`` (UTC)."""
    return or_(muted_until.is_(None), muted_until > now)


def later_end(a: datetime | None, b: datetime | None) -> datetime | None:
    """The later of two mute ends; None (forever) is the latest."""
    if a is None or b is None:
        return None
    return max(utc(a), utc(b))


async def _lock_item(db: AsyncSession, item_id: uuid.UUID) -> None:
    if item_id not in await lock_items(db, item_id):
        raise ItemNotFoundError(item_id)


def mute_event(scope: str, muted_until: datetime | None) -> dict:
    """``price_alert_muted`` properties: what was muted, and whether for a
    time or forever (PI-03 AC 10). The time itself is not sent."""
    return {"scope": scope, "duration": "forever" if muted_until is None else "timed"}


def cooldown_days(user: User) -> int:
    """The user's cooldown, or the server default when they set none."""
    return user.price_alert_cooldown_days or get_settings().price_alert_cooldown_days


def _cents(amount: Decimal) -> Decimal:
    """Half up to the cent: the alert's text and its sparkline agree."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _price_text(amount: Decimal, currency: str, unit: str | None) -> str:
    # Rounded here, not by format_money's binary float ($1.005 -> "$1.00").
    text = format_money(float(_cents(amount)), currency)
    if unit and unit.strip().casefold() not in _COUNT_UNITS:
        text += f"/{unit.strip()}"
    return text


class PriceAlertService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # --- settings and mutes -----------------------------------------------

    async def get_settings(self, user: User) -> PriceAlertSettings:
        default = get_settings().price_alert_threshold_percent
        now = clock.now()
        muted_items = [
            MutedItem(item=item, muted_until=utc(until))
            for item, until in (
                await self.db.execute(
                    select(CanonicalItem, PriceAlertItemMute.muted_until)
                    .join(
                        PriceAlertItemMute,
                        PriceAlertItemMute.canonical_item_id == CanonicalItem.id,
                    )
                    .where(
                        PriceAlertItemMute.user_id == user.id,
                        live(PriceAlertItemMute.muted_until, now),
                    )
                    .order_by(CanonicalItem.canonical_name)
                )
            ).all()
        ]
        # A group muted on two of its stores (one since merged into the
        # other) shows once, with the later end.
        by_group: dict[uuid.UUID, MutedStore] = {}
        for _, group, until in await self._store_mutes(user.id, now):
            seen = by_group.get(group.id)
            end = until if seen is None else later_end(seen.muted_until, until)
            by_group[group.id] = MutedStore(group=group, muted_until=end)
        muted_stores = sorted(
            by_group.values(),
            key=lambda m: (m.group.name.casefold(), str(m.group.id)),
        )
        return PriceAlertSettings(
            enabled=user.price_alerts_enabled,
            threshold_percent=user.price_alert_threshold_percent or default,
            default_threshold_percent=default,
            cooldown_days=cooldown_days(user),
            default_cooldown_days=get_settings().price_alert_cooldown_days,
            muted_items=muted_items,
            muted_stores=muted_stores,
        )

    async def update_settings(self, user: User, changes: dict) -> PriceAlertSettings:
        """Apply the fields the request set. A null threshold or cooldown is
        the default."""
        if "enabled" in changes and changes["enabled"] is not None:
            user.price_alerts_enabled = changes["enabled"]
        if "threshold_percent" in changes:
            user.price_alert_threshold_percent = changes["threshold_percent"]
        if "cooldown_days" in changes:
            user.price_alert_cooldown_days = changes["cooldown_days"]
        await self.db.flush()
        return await self.get_settings(user)

    async def mute_item(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
        muted_until: datetime | None = None,
    ) -> None:
        """Mute until ``muted_until`` (None: forever). Muting again replaces
        the time, an ended mute's too (PI-03 AC 11).

        The item row is locked first (item_locks): a merge of the item
        runs wholly before or after, so it moves this mute or keeps the
        later end, never racing it on the unique key (DA-11). An item a
        merge deleted meanwhile is ItemNotFoundError."""
        await _lock_item(self.db, item_id)
        statement = _insert(self.db)(PriceAlertItemMute).values(
            id=uuid.uuid4(),
            user_id=user_id,
            canonical_item_id=item_id,
            muted_until=utc(muted_until),
        )
        await self.db.execute(
            statement.on_conflict_do_update(
                index_elements=["user_id", "canonical_item_id"],
                set_={"muted_until": statement.excluded.muted_until},
            )
        )

    async def unmute_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
        """Idempotent. Locks the item first, as mute_item does."""
        await _lock_item(self.db, item_id)
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

    async def _store_mutes(
        self, user_id: uuid.UUID, now: datetime | None
    ) -> list[tuple[uuid.UUID, StoreGroup, datetime | None]]:
        """The user's store mute rows as (store id, its group, end): the live
        ones at ``now``, or every row when ``now`` is None. A group is named
        with the name saved on the mute once the user's receipts there are
        purged."""
        query = select(
            PriceAlertStoreMute.store_id,
            PriceAlertStoreMute.store_name,
            PriceAlertStoreMute.muted_until,
        ).where(PriceAlertStoreMute.user_id == user_id)
        if now is not None:
            query = query.where(live(PriceAlertStoreMute.muted_until, now))
        rows = (await self.db.execute(query)).all()
        saved = {store_id: name for store_id, name, _ in rows}
        groups = await StoreService(self.db).groups(user_id, saved, saved)
        return [(store_id, groups[store_id], utc(end)) for store_id, _, end in rows]

    async def mute_store(
        self,
        user_id: uuid.UUID,
        store_id: uuid.UUID,
        muted_until: datetime | None = None,
    ) -> None:
        """Stores are shared: a user may mute only one they have a receipt from.

        Muting again replaces the time for the whole group: a mute recorded
        on another store of the group (one since merged into it) goes, so
        the group has one end. The user's store groups are locked first
        (StoreService.lock_groups, the store merge's lock), so a merge into
        the group cannot leave a mute this replaced (DA-11)."""
        stores = StoreService(self.db)
        await stores.lock_groups(user_id)
        await stores.check_shopped(user_id, store_id)
        group = (await stores.groups(user_id, [store_id]))[store_id]
        others = {
            muted_id
            for muted_id, muted_group, _ in await self._store_mutes(user_id, None)
            if muted_group.id == group.id and muted_id != group.id
        }
        if others:
            await self.db.execute(
                delete(PriceAlertStoreMute).where(
                    PriceAlertStoreMute.user_id == user_id,
                    PriceAlertStoreMute.store_id.in_(others),
                )
            )
        statement = _insert(self.db)(PriceAlertStoreMute).values(
            id=uuid.uuid4(),
            user_id=user_id,
            store_id=group.id,
            # The user's name, kept for when their receipts are purged.
            store_name=group.name,
            muted_until=utc(muted_until),
        )
        await self.db.execute(
            statement.on_conflict_do_update(
                index_elements=["user_id", "store_id"],
                set_={
                    "muted_until": statement.excluded.muted_until,
                    "store_name": statement.excluded.store_name,
                },
            )
        )

    async def unmute_store(self, user_id: uuid.UUID, store_id: uuid.UUID) -> None:
        """Delete the user's own mutes on the store's group, if any. No store
        check: the mute outlives the user's receipts from the store (deleted,
        then purged), and settings still lists it, so it must stay removable.
        Locks the user's store groups first, as mute_store does."""
        stores = StoreService(self.db)
        await stores.lock_groups(user_id)
        target = (await stores.groups(user_id, [store_id])).get(store_id)
        ids = {store_id}
        if target is not None:
            ids |= {
                muted_id
                for muted_id, group, _ in await self._store_mutes(user_id, None)
                if group.id == target.id
            }
        await self.db.execute(
            delete(PriceAlertStoreMute).where(
                PriceAlertStoreMute.user_id == user_id,
                PriceAlertStoreMute.store_id.in_(ids),
            )
        )

    async def item_mute(
        self, user_id: uuid.UUID, item_id: uuid.UUID
    ) -> tuple[bool, datetime | None]:
        """Whether the item's alerts are muted now, and until when (None:
        forever, or not muted). An ended mute is not muted."""
        row = (
            await self.db.execute(
                select(PriceAlertItemMute.muted_until).where(
                    PriceAlertItemMute.user_id == user_id,
                    PriceAlertItemMute.canonical_item_id == item_id,
                    live(PriceAlertItemMute.muted_until, clock.now()),
                )
            )
        ).first()
        return (False, None) if row is None else (True, utc(row[0]))

    # --- detection --------------------------------------------------------

    async def detect(self, receipt: Receipt, now: datetime) -> list[PriceAlert]:
        """Alerts the receipt's prices call for, before the cooldown claim.
        A mute counts while it is live at ``now``, the confirm's server time.

        Ordered by item id, so claims take ledger row locks in one order and
        two concurrent confirms cannot deadlock on them.
        """
        user = await self.db.get(User, receipt.user_id)
        if user is None or not user.price_alerts_enabled:
            return []
        if receipt.store_id is not None and await self._store_muted(
            user.id, receipt.store_id, now
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

        muted = await self._muted_items(user.id, {k[0] for k in grouped}, now)
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
            recent = await prices.recent_prices(
                user.id,
                item_id,
                unit_of_measure=unit,
                currency=currency,
                as_of=receipt.date,
                limit=SPARKLINE_PRICES - 1,
                exclude_receipt_id=receipt.id,
            )
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
                    [*recent, new_price],
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
        recent: list[Decimal],
    ) -> PriceAlert:
        percent = int(abs(change).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        direction = "up" if change > 0 else "down"
        new_text = _price_text(new_price, event.currency, event.unit_of_measure)
        old_text = _price_text(average, event.currency, event.unit_of_measure)
        where = f" at {store_name}" if store_name else ""
        title = f"{item_name} {direction} {percent}%"
        body = f"{item_name}{where}: was {old_text} avg, now {new_text}"
        if direction == "down":
            body += f" · {STOCK_UP}"
        return PriceAlert(
            event=event,
            title=title[:255],
            body=body[:2000],
            data={
                "canonical_item_id": str(event.canonical_item_id),
                "store_id": str(event.store_id) if event.store_id else None,
                # What a Price alerts row shows (PI-03 AC 5), as it was sent.
                "item_name": item_name[:255],
                "store_name": store_name[:255] if store_name else None,
                "direction": direction,
                "percent": percent if direction == "up" else -percent,
                "old_average": old_text,
                "new_price": new_text,
                "recent_prices": [float(_cents(p)) for p in recent],
            },
        )

    async def claim(
        self, user_id: uuid.UUID, item_id: uuid.UUID, now: datetime
    ) -> bool:
        """Record an alert for the item now, unless one was sent in the user's
        cooldown (PI-03 AC 8). The cooldown is read when the claim runs, so a
        changed one counts from the item's last alert (EC-PI 9).

        One upsert on the item's unique ledger row: it inserts the row, or
        moves alerted_at when the last alert is a cooldown old, and otherwise
        changes nothing and returns False. A concurrent claim for the same item
        waits on the row lock and then sees the new alerted_at, so two
        confirms cannot both alert.
        """
        # A plain read of the user row, no lock: the ledger row is the claim.
        user = await self.db.get(User, user_id)
        days = (
            cooldown_days(user)
            if user is not None
            else get_settings().price_alert_cooldown_days
        )
        cutoff = now - timedelta(days=days)
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
        self, user_id: uuid.UUID, item_ids: set[uuid.UUID], now: datetime
    ) -> set[uuid.UUID]:
        if not item_ids:
            return set()
        rows = await self.db.execute(
            select(PriceAlertItemMute.canonical_item_id).where(
                PriceAlertItemMute.user_id == user_id,
                PriceAlertItemMute.canonical_item_id.in_(item_ids),
                live(PriceAlertItemMute.muted_until, now),
            )
        )
        return set(rows.scalars().all())

    async def _store_muted(
        self, user_id: uuid.UUID, store_id: uuid.UUID, now: datetime
    ) -> bool:
        """Whether a live mute covers the store's group (see the mute notes)."""
        muted = await self._store_mutes(user_id, now)
        if not muted:
            return False
        group = (await StoreService(self.db).groups(user_id, [store_id])).get(store_id)
        if group is None:
            return False
        return any(g.id == group.id for _, g, _ in muted)

    async def _store_name(
        self, user_id: uuid.UUID, store_id: uuid.UUID | None
    ) -> str | None:
        """The store as the user's prices group it (their merges)."""
        if store_id is None:
            return None
        group = (await StoreService(self.db).groups(user_id, [store_id])).get(store_id)
        return group.name if group else None
