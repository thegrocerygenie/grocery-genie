"""The options each LiteLLM call sends: model, base URL, sampling, max_tokens."""

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


async def test_default_model_is_claude_sonnet_5_5(calls):
    await LiteLLMReceiptExtractor(_settings()).extract(b"img", "image/jpeg")

    assert calls[0]["model"] == "anthropic/claude-sonnet-5-5"


async def test_temperature_is_not_sent_by_default(calls):
    """Claude Sonnet 5.5 rejects any non-default temperature with a 400."""
    settings = _settings()

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")
    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert all("temperature" not in c for c in calls)


async def test_a_configured_temperature_is_sent(calls):
    """For a model that accepts sampling settings."""
    settings = _settings(llm_temperature=0.0)

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")
    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert [c["temperature"] for c in calls] == [0.0, 0.0]


async def test_max_tokens_is_sent(calls):
    """Without it, LiteLLM asks for the model's full 128K output."""
    settings = _settings()

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")
    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert [c["max_tokens"] for c in calls] == [16000, 16000]


# --- Timeout and retries (DoD box 10): LiteLLM's own default is 6000 s. ---


async def test_both_calls_send_the_default_timeout_and_one_retry(calls):
    settings = _settings()

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")
    await LiteLLMCategoryAssigner(settings).assign(["Milk"])

    assert [(c["timeout"], c["num_retries"]) for c in calls] == [(60.0, 1), (60.0, 1)]


async def test_timeout_and_retries_come_from_settings(calls):
    settings = _settings(llm_timeout_seconds=12.5, llm_num_retries=3)

    await LiteLLMReceiptExtractor(settings).extract(b"img", "image/jpeg")

    assert (calls[0]["timeout"], calls[0]["num_retries"]) == (12.5, 3)


# --- Extraction failures become one domain error the route can answer. ---


@pytest.mark.parametrize(
    "failure",
    [
        provider.litellm.exceptions.Timeout("slow", "m", "anthropic"),
        provider.litellm.exceptions.ServiceUnavailableError("down", "anthropic", "m"),
    ],
    ids=["timeout", "provider-unavailable"],
)
async def test_extractor_wraps_provider_failures(monkeypatch, failure):
    async def failing(**_kwargs):
        raise failure

    monkeypatch.setattr(provider.litellm, "acompletion", failing)

    with pytest.raises(provider.ExtractionUnavailableError):
        await LiteLLMReceiptExtractor(_settings()).extract(b"img", "image/jpeg")


@pytest.mark.parametrize(
    "content",
    ["not json", json.dumps({"store_name": "S"})],
    ids=["not-json", "bad-shape"],
)
async def test_extractor_wraps_unusable_model_output(monkeypatch, content):
    async def answer(**_kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
            usage=None,
        )

    monkeypatch.setattr(provider.litellm, "acompletion", answer)

    with pytest.raises(provider.ExtractionUnavailableError):
        await LiteLLMReceiptExtractor(_settings()).extract(b"img", "image/jpeg")


async def test_extractor_returns_an_answer_with_null_fields_and_no_items(
    monkeypatch,
):
    """The prompt asks for null on an unreadable field. That is an answer to
    review or reject, not an unusable one."""
    content = json.dumps(
        {"store_name": None, "date": None, "items": [], "confidence": 0.1}
    )

    async def answer(**_kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
            usage=None,
        )

    monkeypatch.setattr(provider.litellm, "acompletion", answer)

    result = await LiteLLMReceiptExtractor(_settings()).extract(b"img", "image/jpeg")
    assert result.items == []
    assert result.store_name is None


def test_extractor_names_its_model_and_prompt_version():
    settings = _settings(llm_provider="litellm_proxy", llm_model="receipt-vision")

    extractor = LiteLLMReceiptExtractor(settings)

    assert extractor.model_name == "litellm_proxy/receipt-vision"
    assert extractor.prompt_version == provider.PROMPT_VERSION
