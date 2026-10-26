"""GG_LLM_API_BASE routes LLM calls to a LiteLLM proxy (or any base URL)."""

import json
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.llm import provider
from app.llm.provider import LiteLLMCategoryAssigner, LiteLLMReceiptExtractor

_EXTRACTION = {
    "store_name": "S",
    "date": "2026-03-15",
    "items": [
        {
            "name": "Milk",
            "quantity": 1.0,
            "unit_price": 1.0,
            "total_price": 1.0,
            "confidence": 0.9,
        }
    ],
    "total": 1.0,
    "confidence": 0.9,
}
_CATEGORIES = [{"name": "Milk", "category": "Groceries", "confidence": 0.9}]


@pytest.fixture
def calls(monkeypatch) -> list[dict]:
    """Capture each litellm.acompletion call and answer with canned JSON."""
    captured: list[dict] = []

    async def fake_acompletion(**kwargs):
        captured.append(kwargs)
        is_extraction = isinstance(kwargs["messages"][1]["content"], list)
        content = json.dumps(_EXTRACTION if is_extraction else _CATEGORIES)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
            usage=None,
        )

    monkeypatch.setattr(provider.litellm, "acompletion", fake_acompletion)
    return captured


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, llm_api_key="k", **overrides)


async def test_extractor_sends_the_configured_api_base(calls):
    settings = _settings(
        llm_provider="litellm_proxy",
        llm_model="receipt-vision",
        llm_api_base="http://litellm:4000",
    )

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")

    assert calls[0]["api_base"] == "http://litellm:4000"
    assert calls[0]["model"] == "litellm_proxy/receipt-vision"
    assert calls[0]["api_key"] == "k"


async def test_category_assigner_sends_the_configured_api_base(calls):
    settings = _settings(llm_api_base="http://litellm:4000")

    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert calls[0]["api_base"] == "http://litellm:4000"


async def test_no_api_base_lets_litellm_use_the_provider_default(calls):
    settings = _settings()

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")
    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert [c["api_base"] for c in calls] == [None, None]
