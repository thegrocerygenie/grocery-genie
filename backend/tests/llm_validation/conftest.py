import pytest

from app.core.config import get_settings
from tests.llm_validation import harness


def llm_configured() -> bool:
    """True when an LLM key is set, read the way the app reads it: from the
    environment or from backend/.env."""
    return bool(get_settings().llm_api_key)


# One extraction per receipt per pytest session. The accuracy, hallucination,
# recall, latency and regression tests all score the same calls, so a run costs
# one call per receipt, not one per test.
_extractions: list[harness.Extraction] | None = None


async def _extract_all() -> list[harness.Extraction]:
    global _extractions
    if _extractions is None:
        from app.llm.provider import LiteLLMReceiptExtractor

        extractor = LiteLLMReceiptExtractor(get_settings())
        _extractions = [
            await harness.extract_fixture(extractor, fixture)
            for fixture in harness.load_test_set().scored
        ]
    return _extractions


@pytest.fixture
def test_set() -> harness.TestSet:
    return harness.load_test_set()


@pytest.fixture
async def receipt_scores(test_set) -> list[harness.ReceiptScore]:
    """Scores for every paired, non-adversarial receipt. Skips without any."""
    if not test_set.scored:
        pytest.skip("No receipt test images available")
    return [harness.score_extraction(e) for e in await _extract_all()]
