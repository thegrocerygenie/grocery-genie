"""Stores: normalization for everyone, and each user's own store merges
(EC Price Intelligence 1, decision D3).

Stores are shared across users. Two layers decide which prices count as one
store:

1. Normalization, the same for everyone: case, accents, punctuation and
   branch numbers drop out, so "Loblaws", "LOBLAWS #1234" and
   "Loblaws - 1234" all have the normalized name ``loblaws``. A new receipt
   joins the existing row of its normalized name. Rows that share a
   normalized name anyway (saved before normalization, or by two receipts at
   once) are never deleted: they group under the oldest of them, the group
   root.
2. A user's merge (``user_store_aliases``): "REAL CANADIAN SUPERSTORE" into
   "Loblaws" for that user only. It never renames or joins a shared row.

``groups()`` resolves both layers for one user; every read that groups
prices by store goes through it.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Receipt, Store, User, UserStoreAlias

# A branch marker at the very end of the name, after some other text:
# "LOBLAWS #1234", "Loblaws - 1234", "Loblaws Store #0042", "Loblaws No. 12".
# Only at the end: "Number 1 Chinese" and "Unit 7 Cafe" are names. A bare
# trailing number is never stripped ("Bar 1802", "Pizza 1990", "Forever 21"):
# a store sharing a row with another cannot be split by the user, while a
# missed group costs only a manual merge, so normalization favours precision.
_END_MARKER = re.compile(
    r"(?<=\S)(?:"
    r"\s*#\s*\d+"
    r"|\s+[-–—]\s*#?\s*\d+"
    r"|\s+(?:store|str|branch|location|loc|unit)\.?\s*#?\s*\d+"
    # "No." only with its period, or "No #12": "Cafe No 5" is a name.
    # "Number" is never a marker ("Diner Number 9").
    r"|\s+no(?:\.\s*#?|\s*#)\s*\d+"
    r")\s*$"
)
_APOSTROPHES = re.compile(r"['‘’`]")
_NON_WORD = re.compile(r"[\W_]+")
# stores.normalized_name is String(255).
MAX_NORMALIZED_LENGTH = 255


def normalize_store_name(name: str) -> str:
    """The name every branch and spelling of one store shares.

    Casefolded, accents dropped, a branch marker at the end dropped,
    punctuation turned into single spaces. A different banner of the same
    chain is not this function's job: the user merges it.
    """
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.casefold().strip()
    fallback = text
    while (stripped := _END_MARKER.sub("", text)) != text:
        text = stripped
    text = _APOSTROPHES.sub("", text)
    text = _NON_WORD.sub(" ", text).strip()
    return (text or fallback)[:MAX_NORMALIZED_LENGTH].strip()


class StoreNotFoundError(Exception):
    """The user has no receipt from this store (or it does not exist)."""


class StoreAlreadyMergedError(Exception):
    """The two stores already group as one for this user."""


@dataclass(frozen=True)
class StoreGroup:
    """A store as one user sees it: the group root's id, and the name on the
    user's own oldest receipt of it (the shared row's name, which another
    user's receipt may have given it, only when the user has none)."""

    id: uuid.UUID
    name: str


@dataclass(frozen=True)
class StoreSummary:
    group: StoreGroup
    receipt_count: int
    merged: list[StoreGroup]


class _Resolver:
    def __init__(
        self,
        rows: dict[uuid.UUID, Store],
        roots: dict[str, Store],
        aliases: dict[uuid.UUID, uuid.UUID],
        own_names: dict[str, str],
        saved_names: dict[str, str],
    ) -> None:
        self.rows = rows
        self.roots = roots
        self.aliases = aliases
        self.own_names = own_names
        self.saved_names = saved_names

    def name(self, store: Store) -> str:
        """The user's name for the store: their own oldest receipt's, else the
        name saved on their merge or mute (which outlives purged receipts),
        and the shared row's name only when they have neither."""
        key = store.normalized_name
        return self.own_names.get(key) or self.saved_names.get(key) or store.name

    def root(self, store_id: uuid.UUID) -> Store | None:
        row = self.rows.get(store_id)
        return self.roots.get(row.normalized_name) if row is not None else None

    def group(self, store_id: uuid.UUID) -> StoreGroup | None:
        root = self.root(store_id)
        if root is None:
            return None
        target_id = self.aliases.get(root.id)
        if target_id is not None:
            target = self.root(target_id)
            if target is not None:
                root = target
        return StoreGroup(id=root.id, name=self.name(root))


class StoreService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def find_or_create(self, name: str) -> Store:
        """The store row of this name's normalized form, or a new one."""
        normalized = normalize_store_name(name)

        store = await self.db.scalar(
            select(Store)
            .where(Store.normalized_name == normalized)
            .order_by(Store.created_at, Store.id)
            .limit(1)
        )

        if store is None:
            store = Store(name=name.strip(), normalized_name=normalized)
            self.db.add(store)
            await self.db.flush()

        return store

    # --- grouping -------------------------------------------------------------

    async def _resolver(
        self,
        user_id: uuid.UUID,
        store_ids: Iterable[uuid.UUID | None],
        saved: dict[uuid.UUID, str | None] | None = None,
    ) -> _Resolver:
        """``saved`` maps store ids to names the user saved for them (a
        mute's); the user's merges add theirs."""
        aliases: dict[uuid.UUID, uuid.UUID] = {}
        saved_by_id: dict[uuid.UUID, str] = {
            k: v for k, v in (saved or {}).items() if v
        }
        for source, target, source_name, target_name in (
            await self.db.execute(
                select(
                    UserStoreAlias.store_id,
                    UserStoreAlias.target_store_id,
                    UserStoreAlias.store_name,
                    UserStoreAlias.target_name,
                ).where(UserStoreAlias.user_id == user_id)
            )
        ).all():
            aliases[source] = target
            if source_name:
                saved_by_id.setdefault(source, source_name)
            if target_name:
                saved_by_id.setdefault(target, target_name)
        ids = (
            {i for i in store_ids if i is not None}
            | set(aliases)
            | set(aliases.values())
            | set(saved_by_id)
        )
        rows: dict[uuid.UUID, Store] = {}
        roots: dict[str, Store] = {}
        own_names: dict[str, str] = {}
        if ids:
            rows = {
                s.id: s
                for s in (
                    await self.db.execute(select(Store).where(Store.id.in_(ids)))
                ).scalars()
            }
            names = {s.normalized_name for s in rows.values()}
            for store in (
                await self.db.execute(
                    select(Store)
                    .where(Store.normalized_name.in_(names))
                    .order_by(Store.created_at, Store.id)
                )
            ).scalars():
                roots.setdefault(store.normalized_name, store)
                rows.setdefault(store.id, store)
            # Shared rows keep their first receipt's name, maybe another
            # user's: name each store as the user's own oldest receipt does.
            for normalized, own in (
                await self.db.execute(
                    select(Store.normalized_name, Receipt.store_name)
                    .join(Store, Store.id == Receipt.store_id)
                    .where(
                        Receipt.user_id == user_id,
                        Receipt.store_name.is_not(None),
                        Store.normalized_name.in_(names),
                    )
                    .order_by(Receipt.date, Receipt.created_at, Receipt.id)
                )
            ).all():
                own_names.setdefault(normalized, own)
        saved_names: dict[str, str] = {}
        for store_id, name in saved_by_id.items():
            row = rows.get(store_id)
            if row is not None:
                saved_names.setdefault(row.normalized_name, name)
        return _Resolver(rows, roots, aliases, own_names, saved_names)

    async def groups(
        self,
        user_id: uuid.UUID,
        store_ids: Iterable[uuid.UUID | None],
        saved: dict[uuid.UUID, str | None] | None = None,
    ) -> dict[uuid.UUID, StoreGroup]:
        """Each store's group as this user sees it. Unknown ids are left out.
        ``saved``: names the user saved for some stores (see ``_resolver``)."""
        ids = {i for i in store_ids if i is not None}
        resolver = await self._resolver(user_id, ids, saved)
        out: dict[uuid.UUID, StoreGroup] = {}
        for store_id in ids:
            group = resolver.group(store_id)
            if group is not None:
                out[store_id] = group
        return out

    # --- the user's stores ----------------------------------------------------

    async def check_shopped(self, user_id: uuid.UUID, store_id: uuid.UUID) -> None:
        """Stores are shared: a user may act only on a store they have a
        receipt from (not deleted), or another row of the same normalized
        name (the group root the API hands out)."""
        store = await self.db.get(Store, store_id)
        if store is None:
            raise StoreNotFoundError(store_id)
        shopped = await self.db.scalar(
            select(Receipt.id)
            .join(Store, Store.id == Receipt.store_id)
            .where(
                Receipt.user_id == user_id,
                Receipt.deleted_at.is_(None),
                Store.normalized_name == store.normalized_name,
            )
            .limit(1)
        )
        if shopped is None:
            raise StoreNotFoundError(store_id)

    async def list_stores(self, user_id: uuid.UUID) -> list[StoreSummary]:
        """The user's stores as they group, with the stores merged into each.

        Only stores on receipts the user still has (not deleted) are listed.
        """
        counts = dict(
            (
                await self.db.execute(
                    select(Receipt.store_id, func.count(Receipt.id))
                    .where(
                        Receipt.user_id == user_id,
                        Receipt.deleted_at.is_(None),
                        Receipt.store_id.is_not(None),
                    )
                    .group_by(Receipt.store_id)
                )
            ).all()
        )
        resolver = await self._resolver(user_id, counts)
        totals: dict[uuid.UUID, int] = {}
        groups: dict[uuid.UUID, StoreGroup] = {}
        for store_id, count in counts.items():
            group = resolver.group(store_id)
            if group is None:
                continue
            groups[group.id] = group
            totals[group.id] = totals.get(group.id, 0) + int(count)

        merged: dict[uuid.UUID, list[StoreGroup]] = {}
        for source_id, target_id in resolver.aliases.items():
            source = resolver.root(source_id)
            if source is None:
                continue
            merged.setdefault(target_id, []).append(
                StoreGroup(id=source.id, name=resolver.name(source))
            )

        summaries = [
            StoreSummary(
                group=group,
                receipt_count=totals[group.id],
                merged=sorted(
                    merged.get(group.id, []), key=lambda g: g.name.casefold()
                ),
            )
            for group in groups.values()
        ]
        summaries.sort(key=lambda s: (s.group.name.casefold(), str(s.group.id)))
        return summaries

    async def merge(
        self, user_id: uuid.UUID, store_id: uuid.UUID, into_store_id: uuid.UUID
    ) -> None:
        """Group ``store_id`` (and anything merged into it) under
        ``into_store_id``'s group, for this user only."""
        await self._lock_user(user_id)
        await self.check_shopped(user_id, store_id)
        await self.check_shopped(user_id, into_store_id)
        resolver = await self._resolver(user_id, [store_id, into_store_id])
        source = resolver.root(store_id)
        target = resolver.group(into_store_id)
        if source is None or target is None:
            raise StoreNotFoundError(store_id)
        if resolver.group(store_id) == target:
            raise StoreAlreadyMergedError(store_id)

        # Stores merged into the source move with it: groups stay one deep.
        await self.db.execute(
            update(UserStoreAlias)
            .where(
                UserStoreAlias.user_id == user_id,
                UserStoreAlias.target_store_id == source.id,
            )
            .values(target_store_id=target.id, target_name=target.name)
        )
        # The user's names for both, kept on the merge: they outlive the
        # user's receipts there, while the shared rows' names may be others'.
        source_name = resolver.name(source)
        alias = await self.db.scalar(
            select(UserStoreAlias).where(
                UserStoreAlias.user_id == user_id,
                UserStoreAlias.store_id == source.id,
            )
        )
        if alias is None:
            self.db.add(
                UserStoreAlias(
                    user_id=user_id,
                    store_id=source.id,
                    target_store_id=target.id,
                    store_name=source_name,
                    target_name=target.name,
                )
            )
        else:
            alias.target_store_id = target.id
            alias.store_name = source_name
            alias.target_name = target.name
        await self.db.flush()

    async def _lock_user(self, user_id: uuid.UUID) -> None:
        """One merge or unmerge per user at a time, so two cannot interleave
        into a loop (A into B while B goes into A). FOR NO KEY UPDATE, as in
        category_service: it never blocks a row insert that references the
        user. SQLite ignores the lock."""
        await self.db.execute(
            select(User.id).where(User.id == user_id).with_for_update(key_share=True)
        )

    async def unmerge(self, user_id: uuid.UUID, store_id: uuid.UUID) -> None:
        """Undo the user's merge of this store, if any. Idempotent, and no
        shopped check: it deletes only the user's own row, which can outlive
        their receipts."""
        await self._lock_user(user_id)
        resolver = await self._resolver(user_id, [store_id])
        root = resolver.root(store_id)
        ids = {store_id} | ({root.id} if root is not None else set())
        alias_rows = (
            await self.db.execute(
                select(UserStoreAlias).where(
                    UserStoreAlias.user_id == user_id,
                    UserStoreAlias.store_id.in_(ids),
                )
            )
        ).scalars()
        for alias in alias_rows:
            await self.db.delete(alias)
        await self.db.flush()
