"""Opt-in: item matching on the pair table with the real embedding model.

The rest of the suite uses MockEmbedder. This runs every pair in
``item_match_pairs`` through ItemMatchingService with
sentence-transformers/all-MiniLM-L6-v2 and counts, per group, how many
pairs auto-link, become a suggestion, or are missed (kept apart without a
question). Run it with:

    GG_REAL_EMBEDDINGS=1 pytest tests/services/test_item_matching_real_model.py -s

The model loads from the Hugging Face cache, or downloads (about 90 MB).
"""

import asyncio
import os
import uuid
from collections import Counter
from typing import Any

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.models.database import ItemMatchSuggestion
from app.services.item_matching_service import MATCH_NEW, ItemMatchingService
from tests.services.item_match_pairs import (
    DIFFERENT_PRODUCT,
    QUALIFIER_DIFFERS,
    SAME_PRODUCT,
)
from tests.services.test_item_matching import _receipt

pytestmark = pytest.mark.skipif(
    not os.environ.get("GG_REAL_EMBEDDINGS"),
    reason="Set GG_REAL_EMBEDDINGS=1 to measure matching with the real model",
)


class _RealEmbedder:
    """Loads the model directly: the suite's mock_embedder fixture blocks
    SentenceTransformerEmbedder on purpose."""

    _model: Any = None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if _RealEmbedder._model is None:
            from sentence_transformers import SentenceTransformer

            _RealEmbedder._model = SentenceTransformer(
                get_settings().embedding_model, device="cpu"
            )
        vectors = await asyncio.to_thread(
            _RealEmbedder._model.encode, texts, normalize_embeddings=True
        )
        return [list(map(float, v)) for v in vectors]


async def _outcome(db, existing: str, new: str) -> tuple[str, float | None]:
    """'link', 'suggest' or 'miss' for ``new`` scanned after ``existing``."""
    user_id = uuid.uuid4()
    service = ItemMatchingService(db, _RealEmbedder())
    _, [first_line] = await _receipt(db, existing, user_id=user_id)
    [first] = await service.match_line_items(user_id, [first_line])
    _, [second_line] = await _receipt(db, new, user_id=user_id)
    [second] = await service.match_line_items(user_id, [second_line])
    if second.method != MATCH_NEW:
        assert second.item_id == first.item_id
        return "link", second.confidence
    suggestion = await db.scalar(
        select(ItemMatchSuggestion).where(ItemMatchSuggestion.user_id == user_id)
    )
    if suggestion is not None:
        return "suggest", suggestion.confidence
    return "miss", None


async def test_pair_table_with_the_real_model(db_session):
    groups = {
        "same product": SAME_PRODUCT,
        "qualifier differs": QUALIFIER_DIFFERS,
        "different product": DIFFERENT_PRODUCT,
    }
    counts: dict[str, Counter[str]] = {}
    wrong_links: list[tuple[str, str, float | None]] = []
    for group, pairs in groups.items():
        counts[group] = Counter()
        print(f"\n== {group} ==")
        for existing, new in pairs:
            outcome, score = await _outcome(db_session, existing, new)
            counts[group][outcome] += 1
            shown = f"{score:.3f}" if score is not None else "-"
            print(f"  {outcome:8} {shown:>6}  {existing!r} <- {new!r}")
            if group != "same product" and outcome == "link":
                wrong_links.append((existing, new, score))

    print("\ngroup               link suggest miss")
    for group, c in counts.items():
        print(f"{group:18} {c['link']:5} {c['suggest']:7} {c['miss']:4}")

    assert not [w for w in wrong_links if (w[0], w[1]) in set(QUALIFIER_DIFFERS)], (
        f"Qualifier pairs auto-linked: {wrong_links}"
    )
