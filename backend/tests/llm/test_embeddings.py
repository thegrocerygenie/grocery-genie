"""The item-name embedder (PI-02 semantic matching)."""

import math

import pytest

from app.core.config import get_settings
from app.llm.provider import (
    EmbeddingUnavailableError,
    MockEmbedder,
    SentenceTransformerEmbedder,
    get_embedder,
)


async def test_model_errors_become_embedding_unavailable(monkeypatch):
    """Matching catches this one error and falls back to fuzzy matching."""

    def no_model(self):
        raise OSError("can't download the model")

    monkeypatch.setattr(SentenceTransformerEmbedder, "_load_model", no_model)

    with pytest.raises(EmbeddingUnavailableError):
        await SentenceTransformerEmbedder("any-model").embed(["avocado"])


async def test_empty_input_never_loads_the_model():
    # The conftest guard raises if the model loads.
    assert await SentenceTransformerEmbedder("any-model").embed([]) == []


async def test_encodes_normalized_vectors_in_order(monkeypatch):
    class FakeModel:
        def encode(self, texts, normalize_embeddings, convert_to_numpy):
            assert normalize_embeddings is True
            return [[float(len(t)), 0.0] for t in texts]

    monkeypatch.setattr(
        SentenceTransformerEmbedder, "_load_model", lambda self: FakeModel()
    )

    vectors = await SentenceTransformerEmbedder("m").embed(["ab", "abcd"])

    assert vectors == [[2.0, 0.0], [4.0, 0.0]]


def test_get_embedder_follows_settings(monkeypatch):
    monkeypatch.setenv("GG_EMBEDDINGS_ENABLED", "false")
    get_settings.cache_clear()
    try:
        assert get_embedder() is None
        monkeypatch.setenv("GG_EMBEDDINGS_ENABLED", "true")
        monkeypatch.setenv("GG_EMBEDDING_MODEL", "some/model")
        get_settings.cache_clear()
        embedder = get_embedder()
        assert isinstance(embedder, SentenceTransformerEmbedder)
        assert embedder.model_name == "some/model"
    finally:
        get_settings.cache_clear()


async def test_mock_embedder_is_unit_length_and_deterministic():
    embedder = MockEmbedder({"fixed": [3.0, 4.0]})
    [fixed, hashed] = await embedder.embed(["fixed", "avocado"])

    assert fixed[:2] == pytest.approx([0.6, 0.8])
    assert math.isclose(sum(v * v for v in hashed), 1.0)
    assert (await embedder.embed(["avocado"]))[0] == hashed
