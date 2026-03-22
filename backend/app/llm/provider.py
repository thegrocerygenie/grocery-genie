import base64
import json
import logging
import os
import time
from typing import Protocol

import litellm

from app.core.config import Settings, get_settings
from app.llm.prompts.category_assignment import (
    PROMPT_VERSION as CAT_PROMPT_VERSION,
)
from app.llm.prompts.category_assignment import (
    SYSTEM_PROMPT as CAT_SYSTEM_PROMPT,
)
from app.llm.prompts.receipt_extraction import PROMPT_VERSION, SYSTEM_PROMPT
from app.llm.schemas import ReceiptExtractionResult

logger = logging.getLogger(__name__)


class ReceiptExtractor(Protocol):
    async def extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult: ...


class LiteLLMReceiptExtractor:
    """Production implementation using LiteLLM."""

    def __init__(self, settings: Settings) -> None:
        self.model = f"{settings.llm_provider}/{settings.llm_model}"
        self.temperature = settings.llm_temperature
        self.api_key = settings.llm_api_key

        # LiteLLM reads ANTHROPIC_API_KEY from env for Anthropic provider
        if self.api_key and settings.llm_provider == "anthropic":
            os.environ["ANTHROPIC_API_KEY"] = self.api_key

    async def extract(
        self, image_data: bytes, content_type: str
    ) -> ReceiptExtractionResult:
        image_b64 = base64.b64encode(image_data).decode("utf-8")
        media_type = content_type or "image/jpeg"

        start = time.monotonic()
        response = await litellm.acompletion(
            model=self.model,
            temperature=self.temperature,
            api_key=self.api_key or None,
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

        logger.info(
            "LLM extraction completed",
            extra={
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

    def __init__(self) -> None:
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
        )


class LowConfidenceMockExtractor:
    """Mock that returns low-confidence results for testing non-receipt rejection."""

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
        )


class CategoryAssigner(Protocol):
    async def assign(self, item_names: list[str]) -> list[dict]: ...


class LiteLLMCategoryAssigner:
    """Production implementation for batch category assignment."""

    def __init__(self, settings: Settings) -> None:
        self.model = f"{settings.llm_provider}/{settings.llm_model}"
        self.temperature = settings.llm_temperature
        self.api_key = settings.llm_api_key

        if self.api_key and settings.llm_provider == "anthropic":
            os.environ["ANTHROPIC_API_KEY"] = self.api_key

    async def assign(self, item_names: list[str]) -> list[dict]:
        items_text = "\n".join(f"- {name}" for name in item_names)

        start = time.monotonic()
        response = await litellm.acompletion(
            model=self.model,
            temperature=self.temperature,
            api_key=self.api_key or None,
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

        return json.loads(raw_content)


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


def get_category_assigner(
    settings: Settings | None = None,
) -> CategoryAssigner:
    """Factory function used as FastAPI dependency."""
    if settings is None:
        settings = get_settings()
    if settings.debug:
        return MockCategoryAssigner()
    return LiteLLMCategoryAssigner(settings)
