"""Priority OCR (PREM-03 AC 1, 3): the Premium extraction model is a setting.

The model is named only in config, as a LiteLLM model name. The call goes
through ``app/llm/provider.py`` like the default one, sends no temperature, and
its answer passes the same schema validation.
"""

import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.llm import provider
from app.llm.provider import (
    ExtractionUnavailableError,
    LiteLLMCategoryAssigner,
    LiteLLMReceiptExtractor,
    MockReceiptExtractor,
    premium_receipt_extractor,
)

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


@pytest.fixture
def answer(monkeypatch) -> dict:
    """Capture each litellm.acompletion call; answer with ``answer["content"]``."""
    state: dict = {"calls": [], "content": json.dumps(_EXTRACTION)}

    async def fake_acompletion(**kwargs):
        state["calls"].append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(content=state["content"]))
            ],
            usage=SimpleNamespace(prompt_tokens=3100, completion_tokens=900),
        )

    monkeypatch.setattr(provider.litellm, "acompletion", fake_acompletion)
    return state


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, llm_api_key="k", **overrides)


# --- AC 1: a setting, unset by default, no model in code ---


def test_the_premium_model_setting_is_unset_by_default():
    assert _settings().llm_premium_extraction_model == ""


def test_the_premium_model_is_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("GG_LLM_PREMIUM_EXTRACTION_MODEL", "anthropic/stronger")
    assert Settings(_env_file=None).llm_premium_extraction_model == (
        "anthropic/stronger"
    )


def test_unset_there_is_no_premium_extractor():
    assert premium_receipt_extractor(_settings()) is None
    assert premium_receipt_extractor(_settings(debug=True)) is None


async def test_a_full_litellm_name_is_sent_as_is(answer):
    settings = _settings(llm_premium_extraction_model="openrouter/vendor/vision-xl")

    extractor = premium_receipt_extractor(settings)
    assert isinstance(extractor, LiteLLMReceiptExtractor)
    await extractor.extract(b"img", "image/jpeg")

    assert answer["calls"][0]["model"] == "openrouter/vendor/vision-xl"
    assert extractor.model_name == "openrouter/vendor/vision-xl"


async def test_a_bare_model_name_uses_the_configured_provider_and_gateway(answer):
    settings = _settings(
        llm_provider="litellm_proxy",
        llm_api_base="http://litellm:4000",
        llm_premium_extraction_model="receipt-vision-xl",
    )

    await premium_receipt_extractor(settings).extract(b"img", "image/jpeg")

    call = answer["calls"][0]
    assert call["model"] == "litellm_proxy/receipt-vision-xl"
    assert call["api_base"] == "http://litellm:4000"
    assert call["api_key"] == "k"
    assert call["max_tokens"] == settings.llm_max_tokens
    assert call["timeout"] == settings.llm_timeout_seconds


def test_debug_mode_stubs_the_premium_model_under_its_own_name():
    extractor = premium_receipt_extractor(
        _settings(debug=True, llm_premium_extraction_model="anthropic/stronger")
    )
    assert isinstance(extractor, MockReceiptExtractor)
    assert extractor.model_name == "mock:anthropic/stronger"


def test_no_model_is_named_outside_the_config():
    """Models live in settings (and the docs), never in services or routes."""
    app_dir = Path(provider.__file__).parents[1]
    model_id = re.compile(r"claude-(opus|sonnet|haiku|fable)|gpt-\d|gemini-")
    for path in app_dir.rglob("*.py"):
        if path == app_dir / "core" / "config.py":
            continue
        assert not model_id.search(path.read_text()), f"{path} names a model"


# --- AC 3: through provider.py, no temperature, same validation ---


async def test_the_premium_call_sends_no_temperature(answer):
    # Even when a temperature is set for the default model.
    settings = _settings(llm_temperature=0.0, llm_premium_extraction_model="x/y")

    await premium_receipt_extractor(settings).extract(b"img", "image/jpeg")

    assert "temperature" not in answer["calls"][0]


async def test_the_premium_call_sends_the_same_prompt_as_the_default(answer):
    settings = _settings(llm_premium_extraction_model="x/strong")

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")
    await premium_receipt_extractor(settings).extract(b"img", "image/jpeg")

    default_call, premium_call = answer["calls"]
    assert premium_call["messages"] == default_call["messages"]
    assert premium_call["model"] != default_call["model"]


async def test_premium_output_passes_the_same_validation(answer):
    extractor = premium_receipt_extractor(_settings(llm_premium_extraction_model="x/y"))

    result = await extractor.extract(b"img", "image/jpeg")
    assert result.items[0].name == "Milk"

    answer["content"] = json.dumps({"store_name": "S", "items": "not a list"})
    with pytest.raises(ExtractionUnavailableError):
        await extractor.extract(b"img", "image/jpeg")

    answer["content"] = "not json"
    with pytest.raises(ExtractionUnavailableError):
        await extractor.extract(b"img", "image/jpeg")


async def test_the_extractor_keeps_the_token_counts_of_its_last_call(answer):
    extractor = premium_receipt_extractor(_settings(llm_premium_extraction_model="x/y"))

    await extractor.extract(b"img", "image/jpeg")

    assert extractor.last_usage == (3100, 900)


async def test_category_assignment_keeps_the_default_model(answer):
    settings = _settings(llm_premium_extraction_model="x/strong")
    answer["content"] = json.dumps(
        [{"name": "Milk", "category": "Groceries", "confidence": 0.9}]
    )

    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert answer["calls"][0]["model"] == f"anthropic/{settings.llm_model}"
