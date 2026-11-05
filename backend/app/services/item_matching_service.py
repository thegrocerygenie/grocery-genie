"""Item matching (PI-02): resolve receipt line names to canonical items.

Each user has their own registry of canonical items, and each item has the
names receipts gave it (aliases). A confirmed line goes through, in order:

1. exact alias: its normalized name is already an alias -> that item.
2. fuzzy: string similarity to an alias >= item_match_fuzzy_threshold.
3. semantic: cosine similarity of name embeddings
   >= item_match_semantic_threshold.
4. new: a new canonical item. If the best candidate scored at least
   item_match_suggest_threshold, the user is asked whether the two are the
   same (an ItemMatchSuggestion); accepting merges them.

A name linked by step 2 or 3 becomes an alias of the item, so the next scan
of it is an exact match. Names whose numbers differ ("milk 1%" and "milk 2%",
"cola 1l" and "cola 2l") never match by similarity: the numbers are what tell
those products apart, and both similarity scores rate them close.

Qualifiers work the same way, one step softer (``item_qualifiers``). Names
that differ in a qualifier (organic, fat, size, flavour, store brand,
colour, form, diet: "bananas" and "organic bananas") never auto-link,
however close they score; step 4 asks the user instead. Fuzzy matching
reads a qualifier's receipt abbreviations as the word ("org" is organic).

The user can also merge two items, split an alias off into its own item,
split chosen lines off into new items, and rename an item.
"""

from __future__ import annotations

import json
import logging
import math
import re
import unicodedata
import uuid
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from pgvector.sqlalchemy import Vector
from rapidfuzz.distance import JaroWinkler, Levenshtein
from sqlalchemy import Float, case, cast, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import Settings, get_settings
from app.events.dispatcher import dispatcher
from app.events.types import ItemMatched
from app.llm.provider import Embedder, EmbeddingUnavailableError
from app.models.database import (
    CanonicalItem,
    CanonicalItemAlias,
    ItemMatchSuggestion,
    LineItem,
    Notification,
    PriceAlertItemMute,
    PriceAlertSent,
    PriceObservation,
    Receipt,
)
from app.models.types import EMBEDDING_DIMENSIONS
from app.services.item_qualifiers import qualifiers_compatible, read_qualifiers
from app.services.price_alert_service import (
    NOTIFICATION_TYPE as PRICE_CHANGE_NOTIFICATION,
)
from app.services.price_alert_service import later_end, live

logger = logging.getLogger(__name__)

MATCH_ALIAS = "alias"
MATCH_FUZZY = "fuzzy"
MATCH_SEMANTIC = "semantic"
MATCH_NEW = "new"
MATCH_MANUAL = "manual"

# Nearest aliases fetched per semantic lookup: the closest may fail the
# number or qualifier check, so look a little further.
_SEMANTIC_CANDIDATES = 5

# PI-02 AC 15: similar names offered under "Suggested" on Link items.
_SIMILAR_LINKS = 5

_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


class ItemNotFoundError(Exception):
    """No canonical item (or alias, or suggestion) with that id for this user."""


class SplitLineError(Exception):
    """A split names a line that is not one of the item's, or one twice (422)."""


@dataclass(frozen=True)
class SplitPart:
    """A new item of a split by line (PI-02 AC 11): its name and lines."""

    name: str
    line_item_ids: list[uuid.UUID]


class ItemMatchConflictError(Exception):
    """The operation would leave the registry inconsistent (e.g. split the
    only alias, or merge an item into itself)."""


def normalize_item_name(name: str) -> str:
    """Casefold, drop punctuation, collapse spaces: "Org. Bananas!" -> "org bananas".

    Decimal points and commas inside numbers stay ("2.5kg"), as does "%".
    """
    text = unicodedata.normalize("NFKC", name).casefold()
    text = re.sub(r"(?<!\d)[.,]|[.,](?!\d)", " ", text)
    text = re.sub(r"[^\w%.,]+", " ", text)
    return " ".join(text.split())


def _numbers(normalized: str) -> list[str]:
    return sorted(n.replace(",", ".") for n in _NUMBER.findall(normalized))


def numbers_compatible(a: str, b: str) -> bool:
    """False when both names carry numbers and the numbers differ."""
    numbers_a, numbers_b = _numbers(a), _numbers(b)
    return not (numbers_a and numbers_b and numbers_a != numbers_b)


def fuzzy_similarity(a: str, b: str) -> float:
    """0..1: mean of Jaro-Winkler and Levenshtein similarity on word-sorted names.

    Sorting the words makes "gala apples" equal "apples gala". Jaro-Winkler
    alone rewards a shared prefix too much ("chicken breast" and "chicken
    thighs" score 0.87); averaging with Levenshtein pulls such pairs down.
    Qualifier abbreviations are spelled out first: "org bananas" is
    "organic bananas".
    """
    sorted_a = " ".join(sorted(read_qualifiers(a)[0].split()))
    sorted_b = " ".join(sorted(read_qualifiers(b)[0].split()))
    return (
        JaroWinkler.normalized_similarity(sorted_a, sorted_b)
        + Levenshtein.normalized_similarity(sorted_a, sorted_b)
    ) / 2


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


@dataclass
class _Alias:
    item_id: uuid.UUID
    normalized: str


@dataclass
class _Candidate:
    item_id: uuid.UUID
    score: float
    method: str


@dataclass(frozen=True)
class MatchResult:
    item_id: uuid.UUID
    confidence: float
    method: str


class ItemMatchingService:
    def __init__(
        self,
        db: AsyncSession,
        embedder: Embedder | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.db = db
        self.embedder = embedder
        self.settings = settings or get_settings()

    # --- Matching ---------------------------------------------------------

    async def match_receipt(self, receipt: Receipt) -> list[MatchResult]:
        """Link every line of a confirmed receipt to a canonical item."""
        return await self.match_line_items(receipt.user_id, list(receipt.line_items))

    async def match_line_items(
        self, user_id: uuid.UUID, line_items: Sequence[LineItem]
    ) -> list[MatchResult]:
        """Match ``line_items`` (all the user's) and link each one.

        The same name twice resolves once; a name new on this receipt is
        matched by the lines after it.
        """
        aliases = await self._load_aliases(user_id)
        by_name = {a.normalized: a for a in aliases}

        names = [normalize_item_name(li.raw_name) for li in line_items]
        to_embed = sorted({n for n in names if n and n not in by_name})
        embeddings = await self._embed(to_embed)

        resolved: dict[str, MatchResult] = {}
        results: list[MatchResult] = []
        for line_item, name in zip(line_items, names, strict=True):
            if not name:
                continue
            result = resolved.get(name)
            if result is None:
                result = await self._resolve(
                    user_id, line_item, name, aliases, by_name, embeddings.get(name)
                )
                resolved[name] = result
            await self._link(line_item, result)
            results.append(result)
        return results

    async def _resolve(
        self,
        user_id: uuid.UUID,
        line_item: LineItem,
        name: str,
        aliases: list[_Alias],
        by_name: dict[str, _Alias],
        embedding: list[float] | None,
    ) -> MatchResult:
        exact = by_name.get(name)
        if exact is not None:
            return MatchResult(exact.item_id, 1.0, MATCH_ALIAS)

        # Each step gives its best candidate that may auto-link (same
        # qualifiers) and its best candidate overall (to ask the user about).
        fuzzy_link, fuzzy = self._best_fuzzy(name, aliases)
        semantic_link, semantic = (
            await self._best_semantic(user_id, name, embedding)
            if embedding is not None
            else (None, None)
        )

        settings = self.settings
        if fuzzy_link and fuzzy_link.score >= settings.item_match_fuzzy_threshold:
            chosen = fuzzy_link
        elif (
            semantic_link
            and semantic_link.score >= settings.item_match_semantic_threshold
        ):
            chosen = semantic_link
        else:
            chosen = None

        if chosen is not None:
            await self._add_alias(
                user_id, chosen.item_id, line_item.raw_name, name, embedding
            )
            alias = _Alias(chosen.item_id, name)
            aliases.append(alias)
            by_name[name] = alias
            return MatchResult(chosen.item_id, round(chosen.score, 4), chosen.method)

        item = CanonicalItem(
            user_id=user_id,
            canonical_name=line_item.raw_name.strip()[:255],
            unit_of_measure=line_item.unit_of_measure,
        )
        self.db.add(item)
        await self.db.flush()
        await self._add_alias(user_id, item.id, line_item.raw_name, name, embedding)
        alias = _Alias(item.id, name)
        aliases.append(alias)
        by_name[name] = alias

        best = max(
            (c for c in (fuzzy, semantic) if c is not None),
            key=lambda c: c.score,
            default=None,
        )
        if best and best.score >= self.settings.item_match_suggest_threshold:
            self.db.add(
                ItemMatchSuggestion(
                    user_id=user_id,
                    item_id=item.id,
                    suggested_item_id=best.item_id,
                    confidence=round(best.score, 4),
                    method=best.method,
                    status="pending",
                )
            )
        return MatchResult(item.id, 1.0, MATCH_NEW)

    def _best_fuzzy(
        self, name: str, aliases: list[_Alias]
    ) -> tuple[_Candidate | None, _Candidate | None]:
        """(best alias with the same qualifiers, best alias overall)."""
        best_link: _Candidate | None = None
        best: _Candidate | None = None
        for alias in aliases:
            if not numbers_compatible(name, alias.normalized):
                continue
            candidate = _Candidate(
                alias.item_id, fuzzy_similarity(name, alias.normalized), MATCH_FUZZY
            )
            if best is None or candidate.score > best.score:
                best = candidate
            if qualifiers_compatible(name, alias.normalized) and (
                best_link is None or candidate.score > best_link.score
            ):
                best_link = candidate
        return best_link, best

    async def _best_semantic(
        self, user_id: uuid.UUID, name: str, embedding: list[float]
    ) -> tuple[_Candidate | None, _Candidate | None]:
        """(nearest alias with the same qualifiers, nearest alias overall)."""
        best: _Candidate | None = None
        for alias_name, item_id, similarity in await self._nearest(user_id, embedding):
            if not numbers_compatible(name, alias_name):
                continue
            candidate = _Candidate(item_id, similarity, MATCH_SEMANTIC)
            best = best or candidate
            if qualifiers_compatible(name, alias_name):
                return candidate, best
        return None, best

    async def _nearest(
        self, user_id: uuid.UUID, embedding: list[float]
    ) -> list[tuple[str, uuid.UUID, float]]:
        """The user's aliases nearest ``embedding``: (name, item_id, cosine)."""
        has_embedding = (
            CanonicalItemAlias.user_id == user_id,
            CanonicalItemAlias.embedding.is_not(None),
        )
        if self.db.bind.dialect.name == "postgresql":
            # Exact scan of this user's aliases; see migration 0015.
            distance = CanonicalItemAlias.embedding.op("<=>", return_type=Float)(
                cast(embedding, Vector(EMBEDDING_DIMENSIONS))
            )
            rows = await self.db.execute(
                select(
                    CanonicalItemAlias.normalized_name,
                    CanonicalItemAlias.canonical_item_id,
                    (1 - distance).label("similarity"),
                )
                .where(*has_embedding)
                .order_by(distance)
                .limit(_SEMANTIC_CANDIDATES)
            )
            return [(n, i, float(s)) for n, i, s in rows.all()]

        # SQLite (the test suite) has no vector type: compare in Python.
        rows = await self.db.execute(
            select(
                CanonicalItemAlias.normalized_name,
                CanonicalItemAlias.canonical_item_id,
                CanonicalItemAlias.embedding,
            ).where(*has_embedding)
        )
        scored = [(n, i, _cosine(embedding, e)) for n, i, e in rows.all()]
        scored.sort(key=lambda row: row[2], reverse=True)
        return scored[:_SEMANTIC_CANDIDATES]

    async def _embed(self, names: list[str]) -> dict[str, list[float]]:
        """Embeddings by name; empty when there is no embedder or it fails.

        Matching then falls back to aliases and fuzzy similarity, and the
        nightly sweep fills in the missing alias embeddings.
        """
        if not names or self.embedder is None:
            return {}
        try:
            vectors = await self.embedder.embed(names)
        except EmbeddingUnavailableError:
            logger.warning(
                "Embedding model unavailable; matching %d name(s) without it",
                len(names),
                exc_info=True,
            )
            return {}
        return dict(zip(names, vectors, strict=True))

    async def _load_aliases(self, user_id: uuid.UUID) -> list[_Alias]:
        rows = await self.db.execute(
            select(
                CanonicalItemAlias.canonical_item_id,
                CanonicalItemAlias.normalized_name,
            ).where(CanonicalItemAlias.user_id == user_id)
        )
        return [_Alias(item_id, name) for item_id, name in rows.all()]

    async def _add_alias(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
        raw_name: str,
        normalized: str,
        embedding: list[float] | None,
    ) -> None:
        self.db.add(
            CanonicalItemAlias(
                canonical_item_id=item_id,
                user_id=user_id,
                alias=raw_name.strip()[:500],
                normalized_name=normalized[:500],
                embedding=embedding,
            )
        )
        await self.db.flush()

    async def _link(self, line_item: LineItem, result: MatchResult) -> None:
        line_item.canonical_item_id = result.item_id
        line_item.match_confidence = result.confidence
        line_item.match_method = result.method
        if result.method != MATCH_NEW and line_item.unit_of_measure:
            item = await self.db.get(CanonicalItem, result.item_id)
            if item is not None and item.unit_of_measure is None:
                item.unit_of_measure = line_item.unit_of_measure
        dispatcher.dispatch(
            ItemMatched(
                line_item_id=line_item.id,
                canonical_item_id=result.item_id,
                match_confidence=result.confidence,
                match_method=result.method,
            )
        )

    async def match_unmatched(self, user_id: uuid.UUID) -> int:
        """Match the user's confirmed lines that have no item yet.

        Covers receipts confirmed before item matching existed, and any whose
        matching failed. Returns the number of lines matched.
        """
        rows = await self.db.execute(
            select(LineItem)
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                LineItem.canonical_item_id.is_(None),
            )
            .order_by(Receipt.date, LineItem.position)
        )
        line_items = list(rows.scalars().all())
        if line_items:
            await self.match_line_items(user_id, line_items)
        return len(line_items)

    async def embed_missing_aliases(self, user_id: uuid.UUID) -> int:
        """Fill in alias embeddings that matching could not compute."""
        if self.embedder is None:
            return 0
        rows = await self.db.execute(
            select(CanonicalItemAlias).where(
                CanonicalItemAlias.user_id == user_id,
                CanonicalItemAlias.embedding.is_(None),
            )
        )
        aliases = list(rows.scalars().all())
        vectors = await self._embed([a.normalized_name for a in aliases])
        filled = 0
        for alias in aliases:
            vector = vectors.get(alias.normalized_name)
            if vector is not None:
                alias.embedding = vector
                filled += 1
        await self.db.flush()
        return filled

    # --- User actions -----------------------------------------------------

    async def get_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> CanonicalItem:
        item = await self.db.get(CanonicalItem, item_id)
        if item is None or item.user_id != user_id:
            raise ItemNotFoundError(item_id)
        return item

    async def rename(
        self, user_id: uuid.UUID, item_id: uuid.UUID, name: str
    ) -> CanonicalItem:
        item = await self.get_item(user_id, item_id)
        item.canonical_name = name.strip()[:255]
        await self.db.flush()
        return item

    async def merge(
        self, user_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID
    ) -> CanonicalItem:
        """Fold ``source`` into ``target`` (PI-02 AC 3: link two items).

        Its aliases, lines and prices move to the target, and the source is
        deleted. Pending suggestions about the source move to the target; one
        that would pair the target with itself is dropped.
        """
        if source_id == target_id:
            raise ItemMatchConflictError("An item cannot be merged into itself")
        # Items before suggestion rows, in id order (_lock_items).
        await self._lock_items(source_id, target_id)
        source = await self.get_item(user_id, source_id)
        target = await self.get_item(user_id, target_id)

        await self.db.execute(
            update(CanonicalItemAlias)
            .where(CanonicalItemAlias.canonical_item_id == source.id)
            .values(canonical_item_id=target.id)
        )
        await self.db.execute(
            update(LineItem)
            .where(LineItem.canonical_item_id == source.id)
            .values(
                canonical_item_id=target.id,
                match_method=MATCH_MANUAL,
                match_confidence=1.0,
            )
        )
        await self.db.execute(
            update(PriceObservation)
            .where(PriceObservation.canonical_item_id == source.id)
            .values(canonical_item_id=target.id)
        )
        await self._move_suggestions(source.id, target.id)
        await self._move_price_alert_state(user_id, source.id, target.id)
        if target.unit_of_measure is None:
            target.unit_of_measure = source.unit_of_measure

        # A statement, not session.delete(): the ORM cascade would delete the
        # aliases still listed in source.aliases, which now belong to target.
        # Bulk statements also update the objects already in the session.
        await self.db.execute(
            delete(CanonicalItem).where(CanonicalItem.id == source.id)
        )
        # After the DELETE (EC-PI 11): it waits on the key-share lock of a
        # confirm still writing an alert for the source (its price_alerts_sent
        # row), so this statement, a new snapshot at READ COMMITTED, sees that
        # alert once the confirm commits. Before the DELETE it would miss it.
        await self._move_price_alerts(user_id, source.id, target.id)
        await self.db.flush()
        await self.db.refresh(target, ["aliases"])
        return target

    async def _move_price_alert_state(
        self, user_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID
    ) -> None:
        """A muted item stays muted once merged (PI-03 AC 4): its live mute
        moves to the target. When the target has a mute too, the later end
        stays (forever is the latest; DA-7, EC-PI 5), and a target whose mute
        has ended takes the source's. The source's cooldown row goes with it;
        the target keeps its own."""
        now = clock.now()
        source_mute = await self.db.scalar(
            select(PriceAlertItemMute).where(
                PriceAlertItemMute.user_id == user_id,
                PriceAlertItemMute.canonical_item_id == source_id,
                live(PriceAlertItemMute.muted_until, now),
            )
        )
        target_mute = await self.db.scalar(
            select(PriceAlertItemMute).where(
                PriceAlertItemMute.user_id == user_id,
                PriceAlertItemMute.canonical_item_id == target_id,
            )
        )
        if source_mute is not None and target_mute is None:
            self.db.add(
                PriceAlertItemMute(
                    user_id=user_id,
                    canonical_item_id=target_id,
                    muted_until=source_mute.muted_until,
                )
            )
        elif source_mute is not None:
            # An ended target mute is earlier than any live one.
            target_mute.muted_until = later_end(
                source_mute.muted_until, target_mute.muted_until
            )
        await self.db.execute(
            delete(PriceAlertItemMute).where(
                PriceAlertItemMute.canonical_item_id == source_id
            )
        )
        await self.db.execute(
            delete(PriceAlertSent).where(PriceAlertSent.canonical_item_id == source_id)
        )

    async def _move_price_alerts(
        self, user_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID
    ) -> None:
        """The user's price alerts for the source open the target from now on
        (EC-PI 11): in the Price alerts list, and a push still pending. Only
        the item id in ``data`` changes; the alert's text stays as sent."""
        rows = await self.db.execute(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == PRICE_CHANGE_NOTIFICATION,
                Notification.data.contains(str(source_id)),
            )
        )
        for notification in rows.scalars().all():
            try:
                data = json.loads(notification.data or "")
            except ValueError:
                continue
            if isinstance(data, dict) and data.get("canonical_item_id") == str(
                source_id
            ):
                data["canonical_item_id"] = str(target_id)
                notification.data = json.dumps(data)

    async def _move_suggestions(
        self, source_id: uuid.UUID, target_id: uuid.UUID
    ) -> None:
        rows = await self.db.execute(
            select(ItemMatchSuggestion).where(
                (ItemMatchSuggestion.item_id == source_id)
                | (ItemMatchSuggestion.suggested_item_id == source_id)
            )
        )
        existing_pairs = {
            (s.item_id, s.suggested_item_id)
            for s in (
                await self.db.execute(
                    select(ItemMatchSuggestion).where(
                        (ItemMatchSuggestion.item_id == target_id)
                        | (ItemMatchSuggestion.suggested_item_id == target_id)
                    )
                )
            ).scalars()
        }
        for suggestion in rows.scalars().all():
            item_id = (
                target_id if suggestion.item_id == source_id else suggestion.item_id
            )
            suggested = (
                target_id
                if suggestion.suggested_item_id == source_id
                else suggestion.suggested_item_id
            )
            if item_id == suggested or (item_id, suggested) in existing_pairs:
                await self.db.delete(suggestion)
                continue
            suggestion.item_id = item_id
            suggestion.suggested_item_id = suggested
            existing_pairs.add((item_id, suggested))
        await self.db.flush()

    async def split_alias(
        self, user_id: uuid.UUID, item_id: uuid.UUID, alias_id: uuid.UUID
    ) -> CanonicalItem:
        """Move one alias, with its lines and prices, to a new item (unlink)."""
        item = await self.get_item(user_id, item_id)
        await self.db.refresh(item, ["aliases"])
        alias = next((a for a in item.aliases if a.id == alias_id), None)
        if alias is None:
            raise ItemNotFoundError(alias_id)
        if len(item.aliases) < 2:
            raise ItemMatchConflictError(
                "This is the item's only name; there is nothing to split off"
            )

        new_item = CanonicalItem(
            user_id=user_id,
            household_id=item.household_id,
            canonical_name=alias.alias[:255],
            unit_of_measure=item.unit_of_measure,
        )
        self.db.add(new_item)
        await self.db.flush()
        alias.canonical_item_id = new_item.id

        rows = await self.db.execute(
            select(LineItem).where(LineItem.canonical_item_id == item.id)
        )
        moved = [
            li
            for li in rows.scalars().all()
            if normalize_item_name(li.raw_name) == alias.normalized_name
        ]
        for line_item in moved:
            line_item.canonical_item_id = new_item.id
            line_item.match_method = MATCH_MANUAL
            line_item.match_confidence = 1.0
        if moved:
            await self.db.execute(
                update(PriceObservation)
                .where(PriceObservation.line_item_id.in_([li.id for li in moved]))
                .values(canonical_item_id=new_item.id)
            )
        await self.db.flush()
        await self.db.refresh(item, ["aliases"])
        return new_item

    async def split_lines(
        self, user_id: uuid.UUID, item_id: uuid.UUID, parts: Sequence[SplitPart]
    ) -> list[CanonicalItem]:
        """Move chosen lines, with their prices, to new items (PI-02 AC 10-14).

        A line is one of the item's on the user's confirmed receipts that are
        not deleted (what the split screen lists). Any one can move, though
        its receipt name has other lines. A name whose lines all went to one
        new item goes with them, and so do its lines on deleted receipts, so
        a restore and later scans follow it; a name with lines on both sides,
        or across two new items, stays. The item's pending questions go with
        the line that raised them (_move_raised_suggestions), and a muted
        item's new items are muted too. The original keeps at least one line
        (ItemMatchConflictError: 409); a line that is not the item's, or one
        named twice, is SplitLineError (422).

        Lock order (DA-5): the item first, before any line, price or alias
        row, as merge() and accept_suggestion() lock it; the new items are
        not visible to anyone else until commit.
        """
        await self._lock_items(item_id)
        item = await self.get_item(user_id, item_id)
        rows = await self.db.execute(
            select(LineItem, Receipt.status, Receipt.deleted_at)
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                LineItem.canonical_item_id == item.id,
                Receipt.user_id == user_id,
            )
        )
        visible: dict[uuid.UUID, LineItem] = {}
        hidden: list[LineItem] = []
        for line_item, status, deleted_at in rows.all():
            if status == "confirmed" and deleted_at is None:
                visible[line_item.id] = line_item
            else:
                hidden.append(line_item)

        chosen: dict[uuid.UUID, int] = {}
        for index, part in enumerate(parts):
            for line_id in part.line_item_ids:
                if line_id not in visible or line_id in chosen:
                    raise SplitLineError(line_id)
                chosen[line_id] = index
        if len(chosen) >= len(visible):
            raise ItemMatchConflictError(
                "The original item must keep at least one line"
            )

        new_items = []
        for part in parts:
            units = Counter(
                visible[i].unit_of_measure
                for i in part.line_item_ids
                if visible[i].unit_of_measure
            )
            new_item = CanonicalItem(
                user_id=user_id,
                household_id=item.household_id,
                canonical_name=part.name.strip()[:255],
                unit_of_measure=(
                    units.most_common(1)[0][0] if units else item.unit_of_measure
                ),
            )
            self.db.add(new_item)
            new_items.append(new_item)
        await self.db.flush()

        destination = {
            line_id: new_items[index].id for line_id, index in chosen.items()
        }
        # A name goes with its lines when they all went to one new item.
        by_name: dict[str, set[uuid.UUID]] = {}
        for line_id, line_item in visible.items():
            by_name.setdefault(normalize_item_name(line_item.raw_name), set()).add(
                destination.get(line_id, item.id)
            )
        await self.db.refresh(item, ["aliases"])
        for alias in list(item.aliases):
            targets = by_name.get(alias.normalized_name, set())
            if len(targets) != 1 or item.id in targets:
                continue
            target = next(iter(targets))
            alias.canonical_item_id = target
            for line_item in hidden:
                if normalize_item_name(line_item.raw_name) == alias.normalized_name:
                    destination[line_item.id] = target

        lines = {**visible, **{li.id: li for li in hidden}}
        await self._move_raised_suggestions(item.id, lines, destination)
        for line_id, target in destination.items():
            line_item = lines[line_id]
            line_item.canonical_item_id = target
            # The line matching made the item from keeps "new": it is the
            # line its question shows (suggestion_line) and was raised by.
            if line_item.match_method != MATCH_NEW:
                line_item.match_method = MATCH_MANUAL
                line_item.match_confidence = 1.0
        # Each moved line takes its price along: the observation is the
        # line's (one per line), so nothing is lost or counted twice.
        for target in {*destination.values()}:
            await self.db.execute(
                update(PriceObservation)
                .where(
                    PriceObservation.line_item_id.in_(
                        [i for i, t in destination.items() if t == target]
                    )
                )
                .values(canonical_item_id=target)
            )
        # A muted item's new items stay muted (the user's answer, 2026-11-05),
        # until the same time (DA-7). An ended mute is not copied.
        mute = await self.db.scalar(
            select(PriceAlertItemMute).where(
                PriceAlertItemMute.user_id == user_id,
                PriceAlertItemMute.canonical_item_id == item.id,
                live(PriceAlertItemMute.muted_until, clock.now()),
            )
        )
        if mute is not None:
            for new_item in new_items:
                self.db.add(
                    PriceAlertItemMute(
                        user_id=user_id,
                        canonical_item_id=new_item.id,
                        muted_until=mute.muted_until,
                    )
                )
        await self.db.flush()
        await self.db.refresh(item, ["aliases"])
        for new_item in new_items:
            await self.db.refresh(new_item, ["aliases"])
        return new_items

    async def _move_raised_suggestions(
        self,
        item_id: uuid.UUID,
        lines: dict[uuid.UUID, LineItem],
        destination: dict[uuid.UUID, uuid.UUID],
    ) -> None:
        """The item's pending questions go with the line that raised them:
        the line matching made the item from (MATCH_NEW). When it moved, and
        no such line stays, they belong to its new item, so accepting one
        merges only that item's lines. A question the new item already has,
        or one that would pair it with itself, is dropped. Suggestion rows
        are written after the item lock (DA-5 lock order)."""
        raisers = [li for li in lines.values() if li.match_method == MATCH_NEW]
        targets = {destination.get(li.id) for li in raisers}
        if len(targets) != 1 or None in targets:
            return
        target = targets.pop()
        rows = await self.db.execute(
            select(ItemMatchSuggestion).where(
                ItemMatchSuggestion.item_id == item_id,
                ItemMatchSuggestion.status == "pending",
            )
        )
        for suggestion in rows.scalars().all():
            if suggestion.suggested_item_id == target:
                await self.db.delete(suggestion)
            else:
                suggestion.item_id = target
        await self.db.flush()

    async def link_candidates(
        self, user_id: uuid.UUID, item: CanonicalItem, candidates: list[uuid.UUID]
    ) -> list[uuid.UUID]:
        """The Link items sheet's "Suggested" group (PI-02 AC 15), of the
        ``candidates`` (the user's other items): the item's pending
        suggestions first, newest first, then up to _SIMILAR_LINKS of the
        most similar names, scoring at least the suggest threshold."""
        allowed = set(candidates) - {item.id}
        suggested: list[uuid.UUID] = []
        for suggestion in await self.list_suggestions(user_id, item.id):
            target = suggestion.suggested_item_id
            if target in allowed and target not in suggested:
                suggested.append(target)

        rows = await self.db.execute(
            select(
                CanonicalItemAlias.canonical_item_id,
                CanonicalItemAlias.normalized_name,
            ).where(CanonicalItemAlias.user_id == user_id)
        )
        names: dict[uuid.UUID, set[str]] = {}
        for owner, name in rows.all():
            names.setdefault(owner, set()).add(name)
        items = await self.db.execute(
            select(CanonicalItem.id, CanonicalItem.canonical_name).where(
                CanonicalItem.id.in_(allowed | {item.id})
            )
        )
        for owner, canonical_name in items.all():
            names.setdefault(owner, set()).add(normalize_item_name(canonical_name))
        own = names.get(item.id, set())
        scored = []
        for candidate in candidates:
            if candidate not in allowed or candidate in suggested:
                continue
            score = max(
                (fuzzy_similarity(a, b) for a in own for b in names.get(candidate, ())),
                default=0.0,
            )
            if score >= self.settings.item_match_suggest_threshold:
                scored.append((score, candidate))
        scored.sort(key=lambda pair: -pair[0])
        return suggested + [c for _, c in scored[:_SIMILAR_LINKS]]

    # --- Suggestions (PI-02 AC 2) -----------------------------------------

    async def list_suggestions(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID | None = None,
        receipt_id: uuid.UUID | None = None,
    ) -> list[ItemMatchSuggestion]:
        """The user's pending suggestions, newest first.

        ``receipt_id`` keeps those raised by that receipt's lines (PI-02 AC 7,
        8): a line there that matching made a new item of (``MATCH_NEW``), the
        item the suggestion asks about. A later receipt with the same name
        links to that item by its alias and raises nothing, so it is not
        asked again. The caller checks the receipt is the user's.
        """
        query = (
            select(ItemMatchSuggestion)
            .where(
                ItemMatchSuggestion.user_id == user_id,
                ItemMatchSuggestion.status == "pending",
            )
            .order_by(ItemMatchSuggestion.created_at.desc())
        )
        if item_id is not None:
            query = query.where(ItemMatchSuggestion.item_id == item_id)
        if receipt_id is not None:
            raised = select(LineItem.canonical_item_id).where(
                LineItem.receipt_id == receipt_id,
                LineItem.match_method == MATCH_NEW,
            )
            query = query.where(ItemMatchSuggestion.item_id.in_(raised))
        rows = await self.db.execute(query)
        suggestions = list(rows.scalars().all())
        for suggestion in suggestions:
            await self.db.refresh(suggestion, ["item", "suggested_item"])
        return suggestions

    async def suggestion_line(
        self, user_id: uuid.UUID, item_id: uuid.UUID
    ) -> tuple[LineItem, Receipt] | None:
        """The receipt line a suggestion about ``item_id`` shows (PI-02 AC 5):
        the line matching made the item from, else its latest line; only on
        the user's confirmed receipts that are not deleted."""
        row = (
            await self.db.execute(
                select(LineItem, Receipt)
                .join(Receipt, LineItem.receipt_id == Receipt.id)
                .where(
                    LineItem.canonical_item_id == item_id,
                    Receipt.user_id == user_id,
                    Receipt.status == "confirmed",
                    Receipt.deleted_at.is_(None),
                )
                .order_by(
                    case((LineItem.match_method == MATCH_NEW, 0), else_=1),
                    Receipt.date.desc(),
                    Receipt.created_at.desc(),
                    LineItem.position,
                )
                .limit(1)
            )
        ).first()
        return (row[0], row[1]) if row else None

    async def _lock_items(self, *item_ids: uuid.UUID) -> None:
        """Lock canonical item rows, in id order, for a merge.

        Lock order (DA-5): items first, in id order, then suggestion rows.
        merge() and accept_suggestion() both follow it, and reject_suggestion
        locks only its one suggestion, so no two answers or merges can wait
        on each other in a cycle. FOR NO KEY UPDATE: it does not block a
        confirm linking new lines to the item (their foreign keys take KEY
        SHARE).
        """
        await self.db.execute(
            select(CanonicalItem.id)
            .where(CanonicalItem.id.in_(sorted(set(item_ids))))
            .order_by(CanonicalItem.id)
            .with_for_update(key_share=True)
        )

    async def _get_pending(
        self,
        user_id: uuid.UUID,
        suggestion_id: uuid.UUID,
        *,
        lock_items: bool = False,
    ) -> ItemMatchSuggestion:
        """The pending suggestion, locked for this transaction (PI-02 AC 9).

        A second answer to it waits on the lock, then finds it resolved (or
        merged away) and gets ItemMatchConflictError: 409. ``lock_items``
        (accept) locks its two items first, per the lock order above.
        """
        suggestion = await self.db.get(ItemMatchSuggestion, suggestion_id)
        if suggestion is None or suggestion.user_id != user_id:
            raise ItemNotFoundError(suggestion_id)
        if suggestion.status != "pending":
            raise ItemMatchConflictError(f"Suggestion is already {suggestion.status}")
        pair = (suggestion.item_id, suggestion.suggested_item_id)
        if lock_items:
            await self._lock_items(*pair)
        locked = (
            await self.db.execute(
                select(ItemMatchSuggestion)
                .where(ItemMatchSuggestion.id == suggestion_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if locked is None:
            # Accepted meanwhile: the merge dropped it.
            raise ItemMatchConflictError("Suggestion is already resolved")
        if locked.status != "pending":
            raise ItemMatchConflictError(f"Suggestion is already {locked.status}")
        if lock_items and (locked.item_id, locked.suggested_item_id) != pair:
            # A merge moved it to other items while this waited.
            raise ItemMatchConflictError("Suggestion changed; ask again")
        return locked

    async def accept_suggestion(
        self, user_id: uuid.UUID, suggestion_id: uuid.UUID
    ) -> tuple[CanonicalItem, MatchResult]:
        """Same product: merge the new item into the suggested one.

        Returns the merged item and the match the user confirmed (for the
        precision metric). merge() drops the suggestion itself: it would pair
        the item with itself.
        """
        suggestion = await self._get_pending(user_id, suggestion_id, lock_items=True)
        confirmed = MatchResult(
            suggestion.suggested_item_id, suggestion.confidence, suggestion.method
        )
        target = await self.merge(
            user_id, suggestion.item_id, suggestion.suggested_item_id
        )
        return target, confirmed

    async def reject_suggestion(
        self, user_id: uuid.UUID, suggestion_id: uuid.UUID
    ) -> ItemMatchSuggestion:
        """Different products: keep both items."""
        suggestion = await self._get_pending(user_id, suggestion_id)
        suggestion.status = "rejected"
        suggestion.resolved_at = datetime.now(UTC)
        await self.db.flush()
        return suggestion
