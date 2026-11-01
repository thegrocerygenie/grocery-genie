import pytest

from app.core.config import get_settings
from tests.llm_validation import harness
from tests.llm_validation.conftest import llm_configured

LLM_CONFIGURED = llm_configured()


@pytest.mark.skipif(not LLM_CONFIGURED, reason="LLM API key not configured")
class TestExtractionConsistency:
    """Each receipt runs 5 times with the configured model settings (default
    sampling for Claude Sonnet 5.5). Target: ≥95% give identical output."""

    async def test_consistent_output_across_runs(self, test_set):
        if not test_set.scored:
            pytest.skip("No receipt test images available")

        from app.llm.provider import LiteLLMReceiptExtractor

        extractor = LiteLLMReceiptExtractor(get_settings())
        inconsistent: list[str] = []
        for fixture in test_set.scored:
            runs = [
                (await harness.extract_fixture(extractor, fixture)).result
                for _ in range(harness.CONSISTENCY_RUNS)
            ]
            if not harness.is_consistent(runs):
                inconsistent.append(fixture.receipt_id)

        total = len(test_set.scored)
        rate = (total - len(inconsistent)) / total
        assert rate >= harness.CONSISTENCY_TARGET, (
            f"Consistency rate {rate:.2%} < 95% target: " + ", ".join(inconsistent)
        )
