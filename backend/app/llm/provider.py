import asyncio
import base64
import hashlib
import json
import logging
import math
import threading
import time
from typing import Any, Protocol

import litellm
import openai
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.llm.prompts.category_assignment import (
    PROMPT_VERSION as CAT_PROMPT_VERSION,
)
from app.llm.prompts.category_assignment import (
    SYSTEM_PROMPT as CAT_SYSTEM_PROMPT,
)
from app.llm.prompts.receipt_extraction import PROMPT_VERSION, SYSTEM_PROMPT
from app.llm.schemas import CategoryAssignmentList, ReceiptExtractionResult

logger = logging.getLogger(__name__)


class ExtractionUnavailableError(Exception):
    """The receipt couldn't be read this time: the provider failed or timed out,
    or its answer wasn't a usable extraction. Retrying may work."""


class ReceiptExtractor(Protocol):
    # Saved on each receipt, so a change in model behavior can be traced.
    model_name: str
    prompt_version: str

    async def extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult: ...


# Which model read a scan (PREM-03): the Premium extraction model, or the
# default one. Sent as extraction_tier on receipt_extraction_completed.
EXTRACTION_TIER_PRIORITY = "priority"
EXTRACTION_TIER_STANDARD = "standard"


def _litellm_model_name(settings: Settings, model: str) -> str:
    """A "provider/model" name as is; a bare model name under llm_provider."""
    return model if "/" in model else f"{settings.llm_provider}/{model}"


def _call_options(settings: Settings, model: str | None = None) -> dict:
    """LiteLLM options every call sends, built from settings.

    ``model`` replaces the default model (Priority OCR's Premium model). It is
    sent no temperature: the default's sampling setting is for the default.
    """
    options: dict = {
        "model": _litellm_model_name(settings, model or settings.llm_model),
        "max_tokens": settings.llm_max_tokens,
        "api_key": settings.llm_api_key or None,
        "api_base": settings.llm_api_base or None,
        "timeout": settings.llm_timeout_seconds,
        "num_retries": settings.llm_num_retries,
    }
    # Only when set: LiteLLM refuses any temperature but 1 for a model without
    # sampling settings, such as Claude Sonnet 5.5.
    if settings.llm_temperature is not None and model is None:
        options["temperature"] = settings.llm_temperature
    return options


class LiteLLMReceiptExtractor:
    """Production implementation using LiteLLM."""

    prompt_version = PROMPT_VERSION

    def __init__(self, settings: Settings, model: str | None = None) -> None:
        self.options = _call_options(settings, model)
        self.model_name = self.options["model"]
        # (input, output) tokens of the last call, for the harness's cost.
        self.last_usage: tuple[int | None, int | None] | None = None

    async def extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult:
        try:
            return await self._extract(image_data, content_type)
        except openai.OpenAIError as exc:
            # Every LiteLLM exception derives from openai.OpenAIError (not from
            # litellm.exceptions.OpenAIError): timeouts, rate limits, overloads,
            # and config errors alike.
            logger.error(
                "LLM extraction call failed",
                extra={"error_type": type(exc).__name__, "model": self.model_name},
            )
            raise ExtractionUnavailableError(type(exc).__name__) from exc
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error(
                "LLM extraction returned an unusable answer",
                extra={"error_type": type(exc).__name__, "model": self.model_name},
            )
            raise ExtractionUnavailableError(type(exc).__name__) from exc

    async def _extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult:
        image_b64 = base64.b64encode(image_data).decode("utf-8")
        media_type = content_type or "image/jpeg"

        start = time.monotonic()
        response = await litellm.acompletion(
            **self.options,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{image_b64}"
                            },
                        },
                        {
                            "type": "text",
                            "text": "Extract all data from this receipt image.",
                        },
                    ],
                },
            ],
        )
        latency = time.monotonic() - start

        raw_content = response.choices[0].message.content
        usage = response.usage
        self.last_usage = (
            (usage.prompt_tokens, usage.completion_tokens) if usage else None
        )

        logger.info(
            "LLM extraction completed",
            extra={
                "model": self.model_name,
                "prompt_version": PROMPT_VERSION,
                "latency_seconds": round(latency, 2),
                "input_tokens": usage.prompt_tokens if usage else None,
                "output_tokens": usage.completion_tokens if usage else None,
            },
        )

        parsed = json.loads(raw_content)
        return ReceiptExtractionResult.model_validate(parsed)


class MockReceiptExtractor:
    """Test/development implementation returning deterministic results."""

    prompt_version = PROMPT_VERSION

    def __init__(self, model_name: str = "mock") -> None:
        self.model_name = model_name
        self._result: ReceiptExtractionResult | None = None

    async def extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult:
        if self._result is not None:
            return self._result
        return ReceiptExtractionResult(
            store_name="Test Grocery Store",
            date="2026-03-15",
            currency="USD",
            items=[
                {
                    "name": "Organic Bananas",
                    "quantity": 1.0,
                    "unit_price": 1.29,
                    "total_price": 1.29,
                    "category": "Groceries",
                    "confidence": 0.95,
                },
                {
                    "name": "Whole Milk 1 Gal",
                    "quantity": 1.0,
                    "unit_price": 4.99,
                    "total_price": 4.99,
                    "category": "Groceries",
                    "confidence": 0.92,
                },
                {
                    "name": "Paper Towels 6pk",
                    "quantity": 1.0,
                    "unit_price": 8.49,
                    "total_price": 8.49,
                    "category": "Household",
                    "confidence": 0.90,
                },
            ],
            subtotal=14.77,
            tax=1.18,
            total=15.95,
            confidence=0.91,
            store_name_confidence=0.97,
            date_confidence=0.95,
            total_confidence=0.93,
        )


class LowConfidenceMockExtractor:
    """Mock that returns low-confidence results for testing non-receipt rejection."""

    model_name = "mock"
    prompt_version = PROMPT_VERSION

    async def extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult:
        return ReceiptExtractionResult(
            store_name="Unknown",
            date="2026-01-01",
            currency="USD",
            items=[
                {
                    "name": "Unreadable",
                    "quantity": 1.0,
                    "unit_price": 0.0,
                    "total_price": 0.0,
                    "confidence": 0.1,
                }
            ],
            subtotal=0.0,
            tax=0.0,
            total=0.0,
            confidence=0.15,
            store_name_confidence=0.1,
            date_confidence=0.1,
            total_confidence=0.1,
        )


class CategoryAssigner(Protocol):
    async def assign(self, item_names: list[str]) -> list[dict]: ...


class LiteLLMCategoryAssigner:
    """Production implementation for batch category assignment."""

    def __init__(self, settings: Settings) -> None:
        self.options = _call_options(settings)

    async def assign(self, item_names: list[str]) -> list[dict]:
        items_text = "\n".join(f"- {name}" for name in item_names)

        start = time.monotonic()
        response = await litellm.acompletion(
            **self.options,
            messages=[
                {"role": "system", "content": CAT_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Categorize these items:\n{items_text}",
                },
            ],
        )
        latency = time.monotonic() - start

        raw_content = response.choices[0].message.content
        usage = response.usage

        logger.info(
            "LLM category assignment completed",
            extra={
                "prompt_version": CAT_PROMPT_VERSION,
                "latency_seconds": round(latency, 2),
                "input_tokens": usage.prompt_tokens if usage else None,
                "output_tokens": usage.completion_tokens if usage else None,
                "item_count": len(item_names),
            },
        )

        # Validate the structured output before it can reach the DB. A malformed
        # response (object instead of array, missing keys, bad confidence) raises
        # here and is handled by the caller's rule-based fallback.
        validated = CategoryAssignmentList.model_validate(json.loads(raw_content))
        return [a.model_dump() for a in validated.root]


# Keyword → category-name map for the deterministic fallback. Matched as
# case-insensitive substrings against the raw item name. Categories must match
# the seeded defaults in app/core/seed.py.
_RULE_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (
        (
            "milk",
            "bread",
            "egg",
            "banana",
            "apple",
            "produce",
            "meat",
            "rice",
            "pasta",
            "cheese",
            "yogurt",
            "vegetable",
            "fruit",
            "chicken",
        ),
        "Groceries",
    ),
    (
        ("water", "soda", "juice", "coffee", "tea", "cola", "beer", "wine", "drink"),
        "Beverages",
    ),
    (
        ("chip", "candy", "chocolate", "cookie", "snack", "ice cream", "treat"),
        "Snacks & Treats",
    ),
    (
        (
            "towel",
            "detergent",
            "soap",
            "cleaner",
            "trash",
            "foil",
            "napkin",
            "tissue",
            "battery",
        ),
        "Household",
    ),
    (
        ("shampoo", "toothpaste", "deodorant", "razor", "lotion", "cosmetic"),
        "Personal Care",
    ),
    (("diaper", "wipes", "formula", "baby"), "Baby & Kids"),
    (("dog", "cat", "pet", "kibble", "litter"), "Pet"),
]


class RuleBasedCategoryAssigner:
    """Deterministic keyword fallback used when the LLM assigner is unavailable.

    Satisfies the CLAUDE.md mandate: "Fallback to rule-based processing if LLM
    unavailable." Unmatched items map to "Other" with low confidence so the user
    is prompted to review them.
    """

    async def assign(self, item_names: list[str]) -> list[dict]:
        out: list[dict] = []
        for name in item_names:
            lowered = name.lower()
            category = "Other"
            for keywords, cat in _RULE_KEYWORDS:
                if any(kw in lowered for kw in keywords):
                    category = cat
                    break
            out.append({"name": name, "category": category, "confidence": 0.4})
        return out


class MockCategoryAssigner:
    """Test/development implementation returning deterministic categories."""

    async def assign(self, item_names: list[str]) -> list[dict]:
        return [
            {"name": name, "category": "Groceries", "confidence": 0.85}
            for name in item_names
        ]


def get_receipt_extractor(
    settings: Settings | None = None,
) -> ReceiptExtractor:
    """Factory function used as FastAPI dependency."""
    if settings is None:
        settings = get_settings()
    if settings.debug:
        return MockReceiptExtractor()
    return LiteLLMReceiptExtractor(settings)


def premium_receipt_extractor(settings: Settings) -> ReceiptExtractor | None:
    """The extractor for Premium users' scans (PREM-03), or None when no
    Premium model is configured (Premium scans then use the default).

    In debug mode it is the mock under the configured name, so a stubbed run
    can still tell which model a scan was routed to.
    """
    model = settings.llm_premium_extraction_model.strip()
    if not model:
        return None
    if settings.debug:
        return MockReceiptExtractor(model_name=f"mock:{model}")
    return LiteLLMReceiptExtractor(settings, model=model)


def get_premium_receipt_extractor() -> ReceiptExtractor | None:
    """FastAPI dependency for ``premium_receipt_extractor``.

    No parameters: FastAPI would read a ``settings`` parameter as request body.
    """
    return premium_receipt_extractor(get_settings())


def get_category_assigner(
    settings: Settings | None = None,
) -> CategoryAssigner:
    """Factory function used as FastAPI dependency."""
    if settings is None:
        settings = get_settings()
    if settings.debug:
        return MockCategoryAssigner()
    return LiteLLMCategoryAssigner(settings)


# --- Embeddings (PI-02 semantic item matching) ---------------------------


class EmbeddingUnavailableError(Exception):
    """The embedding model could not be loaded or failed to encode."""


class Embedder(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """One unit-length vector per text, in order."""
        ...


class SentenceTransformerEmbedder:
    """Embeds item names with a local sentence-transformers model.

    The model runs in this process: item names are not sent anywhere. It
    loads on first use (a few seconds, and a download the first time on a
    new host) and stays loaded for the life of the process.
    """

    _models: dict[str, Any] = {}
    _lock = threading.Lock()

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name

    def _load_model(self) -> Any:
        with self._lock:
            model = self._models.get(self.model_name)
            if model is None:
                from sentence_transformers import SentenceTransformer

                started = time.monotonic()
                model = SentenceTransformer(self.model_name, device="cpu")
                self._models[self.model_name] = model
                logger.info(
                    "Loaded embedding model %s in %.1fs",
                    self.model_name,
                    time.monotonic() - started,
                )
            return model

    def _encode(self, texts: list[str]) -> list[list[float]]:
        vectors = self._load_model().encode(
            texts, normalize_embeddings=True, convert_to_numpy=True
        )
        return [[float(v) for v in row] for row in vectors]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            # CPU-bound: keep it off the event loop.
            return await asyncio.to_thread(self._encode, texts)
        except Exception as exc:
            raise EmbeddingUnavailableError(str(exc)) from exc


class MockEmbedder:
    """Deterministic embeddings for tests and offline development.

    A name with an entry in ``vectors`` gets that vector (normalized), so a
    test can set the exact similarity of two names. Any other name gets a
    hashed bag of character trigrams: similar spellings come out close.
    """

    def __init__(
        self, vectors: dict[str, list[float]] | None = None, dimensions: int = 384
    ) -> None:
        self.vectors = vectors or {}
        self.dimensions = dimensions
        self.calls: list[list[str]] = []

    def _vector(self, text: str) -> list[float]:
        if text in self.vectors:
            raw = list(self.vectors[text])
            raw += [0.0] * (self.dimensions - len(raw))
        else:
            raw = [0.0] * self.dimensions
            padded = f"  {text} "
            for i in range(len(padded) - 2):
                digest = hashlib.blake2b(
                    padded[i : i + 3].encode(), digest_size=4
                ).digest()
                raw[int.from_bytes(digest, "big") % self.dimensions] += 1.0
        norm = math.sqrt(sum(v * v for v in raw)) or 1.0
        return [v / norm for v in raw]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [self._vector(text) for text in texts]


def get_embedder() -> Embedder | None:
    """FastAPI dependency: the item-name embedder, or None when turned off.

    No parameters: FastAPI would read a ``settings`` parameter as request body.
    """
    settings = get_settings()
    if not settings.embeddings_enabled:
        return None
    return SentenceTransformerEmbedder(settings.embedding_model)
