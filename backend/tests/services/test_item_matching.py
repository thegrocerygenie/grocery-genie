"""PI-02 item matching: the pipeline, the thresholds, merge and split."""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.events.dispatcher import dispatcher
from app.events.types import ItemMatched
from app.llm.provider import EmbeddingUnavailableError, MockEmbedder
from app.models.database import (
    CanonicalItem,
    CanonicalItemAlias,
    ItemMatchSuggestion,
    LineItem,
    PriceObservation,
    Receipt,
)
from app.services.item_matching_service import (
    MATCH_ALIAS,
    MATCH_FUZZY,
    MATCH_MANUAL,
    MATCH_NEW,
    MATCH_SEMANTIC,
    ItemMatchConflictError,
    ItemMatchingService,
    ItemNotFoundError,
    fuzzy_similarity,
    normalize_item_name,
    numbers_compatible,
)
from tests.conftest import ensure_user

USER = uuid.UUID("00000000-0000-0000-0000-0000000000a1")
OTHER_USER = uuid.UUID("00000000-0000-0000-0000-0000000000a2")


def _vec(*values: float) -> list[float]:
    return list(values)


# --- Name normalization and similarity -----------------------------------


@pytest.mark.parametrize(
    ("raw", "normalized"),
    [
        ("ORG BANANAS", "org bananas"),
        ("Org. Bananas!", "org bananas"),
        ("  Coca-Cola   2L ", "coca cola 2l"),
        ("Milk 2% 4L", "milk 2% 4l"),
        ("Cheese 2.5kg", "cheese 2.5kg"),
        ("Café Crème", "café crème"),
    ],
)
def test_normalize_item_name(raw, normalized):
    assert normalize_item_name(raw) == normalized


def test_names_with_different_numbers_never_match():
    assert not numbers_compatible("milk 2% 4l", "milk 1% 4l")
    assert not numbers_compatible("cola 2l", "cola 1l")
    assert numbers_compatible("milk 2% 4l", "2% milk 4l")
    # One side without numbers says nothing about size: still comparable.
    assert numbers_compatible("lg eggs 12ct", "eggs large")


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("avocado", "avocados"),
        ("greek yogurt", "greek yoghurt"),
        ("gala apples", "apples gala"),
        ("bananas", "banana"),
    ],
)
def test_spelling_variants_reach_the_auto_link_threshold(a, b):
    assert fuzzy_similarity(a, b) >= get_settings().item_match_fuzzy_threshold


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("chicken breast", "chicken thighs"),
        ("ground beef", "ground pork"),
    ],
)
def test_different_products_with_a_shared_word_stay_apart(a, b):
    """Jaro-Winkler alone scores these >= 0.85; the mean with Levenshtein
    keeps them below the suggestion threshold."""
    assert fuzzy_similarity(a, b) < get_settings().item_match_suggest_threshold


# --- The matching pipeline -------------------------------------------------


async def _receipt(db, *names: str, user_id=USER, unit: str | None = None):
    await ensure_user(db, user_id)
    receipt = Receipt(
        user_id=user_id, date=date(2026, 3, 10), status="confirmed", currency="USD"
    )
    db.add(receipt)
    await db.flush()
    lines = []
    for position, name in enumerate(names):
        line = LineItem(
            receipt_id=receipt.id,
            raw_name=name,
            position=position,
            quantity=1,
            unit_price=2.0,
            total_price=2.0,
            unit_of_measure=unit,
        )
        db.add(line)
        lines.append(line)
    await db.flush()
    return receipt, lines


async def _match(db, *names, embedder=None, user_id=USER, unit=None):
    _, lines = await _receipt(db, *names, user_id=user_id, unit=unit)
    service = ItemMatchingService(db, embedder)
    return lines, await service.match_line_items(user_id, lines)


async def _count(db, model, **where) -> int:
    query = select(func.count()).select_from(model)
    for column, value in where.items():
        query = query.where(getattr(model, column) == value)
    return (await db.execute(query)).scalar_one()


async def test_new_name_creates_a_canonical_item_with_that_alias(db_session):
    lines, [result] = await _match(db_session, "ORG BANANAS", unit="lb")

    assert result.method == MATCH_NEW
    item = await db_session.get(CanonicalItem, result.item_id)
    assert item.canonical_name == "ORG BANANAS"
    assert item.unit_of_measure == "lb"
    await db_session.refresh(item, ["aliases"])
    assert [a.normalized_name for a in item.aliases] == ["org bananas"]
    assert lines[0].canonical_item_id == item.id
    assert lines[0].match_method == MATCH_NEW


async def test_exact_alias_links_to_the_same_item(db_session):
    _, [first] = await _match(db_session, "ORG BANANAS")
    lines, [second] = await _match(db_session, "Org. Bananas")

    assert second.method == MATCH_ALIAS
    assert second.confidence == 1.0
    assert second.item_id == first.item_id
    assert lines[0].canonical_item_id == first.item_id


async def test_high_fuzzy_score_auto_links_and_learns_the_alias(db_session):
    """PI-02 AC 2 (>= 0.85 auto-link) and AC 4 (the match adds an alias)."""
    _, [first] = await _match(db_session, "Avocado")
    _, [second] = await _match(db_session, "AVOCADOS")

    assert second.method == MATCH_FUZZY
    assert second.confidence >= 0.85
    assert second.item_id == first.item_id
    aliases = await db_session.execute(
        select(CanonicalItemAlias.normalized_name).where(
            CanonicalItemAlias.canonical_item_id == first.item_id
        )
    )
    assert sorted(aliases.scalars()) == ["avocado", "avocados"]
    assert await _count(db_session, ItemMatchSuggestion) == 0


async def test_high_semantic_similarity_auto_links(db_session):
    """PI-02 AC 1: embedding similarity finds what spelling cannot."""
    embedder = MockEmbedder(
        {"cheddar cheese": _vec(1, 0, 0), "ks ched chs": _vec(0.9, 0.3, 0)}
    )
    _, [first] = await _match(db_session, "Cheddar Cheese", embedder=embedder)
    _, [second] = await _match(db_session, "KS CHED CHS", embedder=embedder)

    assert second.method == MATCH_SEMANTIC
    assert second.confidence >= 0.80
    assert second.item_id == first.item_id


async def test_medium_score_asks_the_user_and_keeps_the_line_separate(db_session):
    """PI-02 AC 2: 0.6-0.85 prompts for confirmation instead of linking."""
    embedder = MockEmbedder(
        {"cucumber": _vec(1, 0, 0), "cucumbers eng": _vec(0.6, 0.8, 0)}
    )
    _, [first] = await _match(db_session, "Cucumber", embedder=embedder)
    _, [second] = await _match(db_session, "CUCUMBERS ENG", embedder=embedder)

    assert second.method == MATCH_NEW
    assert second.item_id != first.item_id
    suggestion = (await db_session.execute(select(ItemMatchSuggestion))).scalar_one()
    assert suggestion.item_id == second.item_id
    assert suggestion.suggested_item_id == first.item_id
    assert suggestion.status == "pending"
    assert 0.6 <= suggestion.confidence < 0.85
    assert suggestion.method == MATCH_FUZZY


async def test_medium_semantic_score_suggests(db_session):
    embedder = MockEmbedder({"seltzer": _vec(1, 0, 0), "soda water": _vec(0.7, 0.7)})
    _, [first] = await _match(db_session, "Seltzer", embedder=embedder)
    _, [second] = await _match(db_session, "Soda Water", embedder=embedder)

    suggestion = (await db_session.execute(select(ItemMatchSuggestion))).scalar_one()
    assert suggestion.method == MATCH_SEMANTIC
    assert suggestion.suggested_item_id == first.item_id
    assert suggestion.confidence == pytest.approx(0.7071, abs=1e-3)


async def test_low_score_is_a_distinct_item_with_no_question(db_session):
    """PI-02 AC 2: < 0.6 is treated as distinct."""
    embedder = MockEmbedder({"ground beef": _vec(1, 0), "ground pork": _vec(0.3, 0.95)})
    _, [first] = await _match(db_session, "Ground Beef", embedder=embedder)
    _, [second] = await _match(db_session, "Ground Pork", embedder=embedder)

    assert second.method == MATCH_NEW
    assert second.item_id != first.item_id
    assert await _count(db_session, ItemMatchSuggestion) == 0


async def test_numbers_that_differ_block_even_a_close_match(db_session):
    embedder = MockEmbedder({"milk 2% 4l": _vec(1, 0), "milk 1% 4l": _vec(1, 0.01)})
    _, [first] = await _match(db_session, "MILK 2% 4L", embedder=embedder)
    _, [second] = await _match(db_session, "MILK 1% 4L", embedder=embedder)

    assert second.item_id != first.item_id
    assert await _count(db_session, ItemMatchSuggestion) == 0


async def test_same_name_twice_on_a_receipt_is_one_item(db_session):
    lines, results = await _match(db_session, "Limes", "LIMES")

    assert results[0].item_id == results[1].item_id
    assert lines[0].canonical_item_id == lines[1].canonical_item_id
    assert await _count(db_session, CanonicalItem) == 1


async def test_a_name_new_on_this_receipt_matches_the_lines_after_it(db_session):
    _, results = await _match(db_session, "Avocado", "Avocados")

    assert results[1].method == MATCH_FUZZY
    assert results[1].item_id == results[0].item_id


async def test_registries_are_per_user(db_session):
    _, [mine] = await _match(db_session, "Avocado")
    _, [theirs] = await _match(db_session, "Avocado", user_id=OTHER_USER)

    assert theirs.method == MATCH_NEW
    assert theirs.item_id != mine.item_id


async def test_embedding_failure_falls_back_to_fuzzy_matching(db_session):
    class BrokenEmbedder:
        async def embed(self, texts):
            raise EmbeddingUnavailableError("model missing")

    _, [first] = await _match(db_session, "Avocado", embedder=BrokenEmbedder())
    _, [second] = await _match(db_session, "Avocados", embedder=BrokenEmbedder())

    assert second.method == MATCH_FUZZY
    assert second.item_id == first.item_id
    alias = (await db_session.execute(select(CanonicalItemAlias))).scalars().first()
    assert alias.embedding is None  # the nightly sweep fills it in


async def test_new_aliases_store_their_embedding(db_session):
    embedder = MockEmbedder()
    await _match(db_session, "Avocado", embedder=embedder)

    alias = (await db_session.execute(select(CanonicalItemAlias))).scalar_one()
    assert alias.embedding is not None
    assert len(alias.embedding) == 384
    assert embedder.calls == [["avocado"]]


async def test_exact_alias_hits_skip_the_embedding_model(db_session):
    embedder = MockEmbedder()
    await _match(db_session, "Avocado", embedder=embedder)
    await _match(db_session, "AVOCADO", embedder=embedder)

    assert embedder.calls == [["avocado"]]


async def test_each_match_publishes_item_matched(db_session, monkeypatch):
    received: list[ItemMatched] = []
    monkeypatch.setattr(
        dispatcher, "_handlers", {ItemMatched: [received.append]}, raising=True
    )
    lines, [result] = await _match(db_session, "Avocado")

    assert received == [
        ItemMatched(
            line_item_id=lines[0].id,
            canonical_item_id=result.item_id,
            match_confidence=1.0,
            match_method=MATCH_NEW,
        )
    ]


# --- User actions: merge, split, rename, suggestions -------------------------


async def _observe(db, line: LineItem) -> None:
    receipt = await db.get(Receipt, line.receipt_id)
    db.add(
        PriceObservation(
            user_id=receipt.user_id,
            canonical_item_id=line.canonical_item_id,
            receipt_id=receipt.id,
            line_item_id=line.id,
            date=receipt.date,
            unit_price=2.0,
            quantity=1,
            currency="USD",
        )
    )
    await db.flush()


async def test_merge_moves_aliases_lines_and_prices(db_session):
    """PI-02 AC 3: the user links two items."""
    a_lines, [a] = await _match(db_session, "Seltzer")
    b_lines, [b] = await _match(db_session, "Soda Water")
    await _observe(db_session, a_lines[0])
    await _observe(db_session, b_lines[0])
    service = ItemMatchingService(db_session)

    merged = await service.merge(USER, b.item_id, a.item_id)

    assert merged.id == a.item_id
    assert await db_session.get(CanonicalItem, b.item_id) is None
    await db_session.refresh(merged, ["aliases"])
    assert {x.normalized_name for x in merged.aliases} == {"seltzer", "soda water"}
    assert await _count(db_session, LineItem, canonical_item_id=a.item_id) == 2
    assert await _count(db_session, PriceObservation, canonical_item_id=a.item_id) == 2
    line = await db_session.get(LineItem, b_lines[0].id)
    assert line.match_method == MATCH_MANUAL
    # The next scan of the merged-in name goes straight to the kept item.
    _, [again] = await _match(db_session, "SODA WATER")
    assert again.method == MATCH_ALIAS
    assert again.item_id == a.item_id


async def test_merge_into_itself_or_another_users_item_is_refused(db_session):
    _, [mine] = await _match(db_session, "Avocado")
    _, [theirs] = await _match(db_session, "Avocado", user_id=OTHER_USER)
    service = ItemMatchingService(db_session)

    with pytest.raises(ItemMatchConflictError):
        await service.merge(USER, mine.item_id, mine.item_id)
    with pytest.raises(ItemNotFoundError):
        await service.merge(USER, mine.item_id, theirs.item_id)


async def test_split_moves_one_alias_with_its_lines_and_prices(db_session):
    """PI-02 AC 3 / FR "split a mismatch": unlink a wrongly matched name."""
    a_lines, [a] = await _match(db_session, "Avocado")
    b_lines, [b] = await _match(db_session, "Avocados")
    assert a.item_id == b.item_id
    await _observe(db_session, a_lines[0])
    await _observe(db_session, b_lines[0])
    service = ItemMatchingService(db_session)
    item = await service.get_item(USER, a.item_id)
    await db_session.refresh(item, ["aliases"])
    plural = next(x for x in item.aliases if x.normalized_name == "avocados")

    new_item = await service.split_alias(USER, a.item_id, plural.id)

    assert new_item.id != a.item_id
    assert new_item.canonical_name == "Avocados"
    assert (await db_session.get(LineItem, b_lines[0].id)).canonical_item_id == (
        new_item.id
    )
    assert (await db_session.get(LineItem, a_lines[0].id)).canonical_item_id == (
        a.item_id
    )
    assert (
        await _count(db_session, PriceObservation, canonical_item_id=new_item.id) == 1
    )
    assert await _count(db_session, PriceObservation, canonical_item_id=a.item_id) == 1
    # The split name now resolves to its own item.
    _, [again] = await _match(db_session, "AVOCADOS")
    assert again.method == MATCH_ALIAS
    assert again.item_id == new_item.id


async def test_split_of_the_only_alias_is_refused(db_session):
    _, [a] = await _match(db_session, "Avocado")
    service = ItemMatchingService(db_session)
    item = await service.get_item(USER, a.item_id)
    await db_session.refresh(item, ["aliases"])

    with pytest.raises(ItemMatchConflictError):
        await service.split_alias(USER, a.item_id, item.aliases[0].id)


async def test_rename_sets_the_canonical_name(db_session):
    _, [a] = await _match(db_session, "ORG BNNA")
    item = await ItemMatchingService(db_session).rename(
        USER, a.item_id, "  Organic Bananas "
    )
    assert item.canonical_name == "Organic Bananas"


async def _suggested_pair(db):
    embedder = MockEmbedder({"seltzer": _vec(1, 0), "soda water": _vec(0.7, 0.7)})
    _, [first] = await _match(db, "Seltzer", embedder=embedder)
    lines, [second] = await _match(db, "Soda Water", embedder=embedder)
    await _observe(db, lines[0])
    suggestion = (await db.execute(select(ItemMatchSuggestion))).scalar_one()
    return first, second, suggestion


async def test_accepting_a_suggestion_merges_the_items(db_session):
    first, second, suggestion = await _suggested_pair(db_session)
    service = ItemMatchingService(db_session)

    merged, match = await service.accept_suggestion(USER, suggestion.id)

    assert merged.id == first.item_id
    assert match.method == MATCH_SEMANTIC
    assert await db_session.get(CanonicalItem, second.item_id) is None
    assert (
        await _count(db_session, PriceObservation, canonical_item_id=first.item_id) == 1
    )
    assert await service.list_suggestions(USER) == []


async def test_rejecting_a_suggestion_keeps_both_items(db_session):
    first, second, suggestion = await _suggested_pair(db_session)
    service = ItemMatchingService(db_session)

    rejected = await service.reject_suggestion(USER, suggestion.id)

    assert rejected.status == "rejected"
    assert rejected.resolved_at is not None
    assert await db_session.get(CanonicalItem, second.item_id) is not None
    assert await service.list_suggestions(USER) == []
    with pytest.raises(ItemMatchConflictError):
        await service.accept_suggestion(USER, suggestion.id)
    # Asked once: the name now resolves to its own item, with no new question.
    _, [again] = await _match(db_session, "soda water")
    assert again.method == MATCH_ALIAS
    assert await _count(db_session, ItemMatchSuggestion, status="pending") == 0


async def test_another_users_suggestion_is_not_found(db_session):
    _, _, suggestion = await _suggested_pair(db_session)
    with pytest.raises(ItemNotFoundError):
        await ItemMatchingService(db_session).accept_suggestion(
            OTHER_USER, suggestion.id
        )


async def test_merge_moves_pending_questions_about_the_merged_item(db_session):
    """A question about the merged-away item now asks about the kept one."""
    first, second, suggestion = await _suggested_pair(db_session)
    _, [third] = await _match(db_session, "Club Soda")
    service = ItemMatchingService(db_session)

    await service.merge(USER, first.item_id, third.item_id)

    await db_session.refresh(suggestion)
    assert suggestion.item_id == second.item_id
    assert suggestion.suggested_item_id == third.item_id


async def test_match_unmatched_backfills_confirmed_lines(db_session):
    _, lines = await _receipt(db_session, "Avocado", "Limes")
    service = ItemMatchingService(db_session)

    assert await service.match_unmatched(USER) == 2
    assert all(line.canonical_item_id for line in lines)
    assert await service.match_unmatched(USER) == 0


def test_thresholds_default_to_the_prd_values():
    """PI-02 AC 2 and the functional requirements: 0.85 / 0.80 / 0.6."""
    settings = get_settings()
    assert settings.item_match_fuzzy_threshold == 0.85
    assert settings.item_match_semantic_threshold == 0.80
    assert settings.item_match_suggest_threshold == 0.60


async def test_thresholds_are_configurable(db_session):
    """Raise the auto-link bar and a pair that linked on its own becomes a
    question for the user instead."""
    strict = get_settings().model_copy(update={"item_match_fuzzy_threshold": 0.99})
    _, [first] = await _match(db_session, "Avocado")
    _, lines = await _receipt(db_session, "Avocados")

    [second] = await ItemMatchingService(db_session, settings=strict).match_line_items(
        USER, lines
    )

    assert second.method == MATCH_NEW
    suggestion = (await db_session.execute(select(ItemMatchSuggestion))).scalar_one()
    assert suggestion.suggested_item_id == first.item_id
