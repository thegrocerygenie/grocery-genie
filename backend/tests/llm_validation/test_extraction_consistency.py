import os

import pytest

LLM_CONFIGURED = bool(os.environ.get("GG_LLM_API_KEY"))


@pytest.mark.skipif(not LLM_CONFIGURED, reason="LLM API key not configured")
class TestExtractionConsistency:
    """Run each receipt through extraction multiple times.

    With temperature=0, outputs should be identical across runs.
    Target: >=95% of receipts produce identical output across 5 runs.
    """

    RUNS_PER_RECEIPT = 5

    async def test_consistent_output_at_temperature_zero(self, receipt_test_set):
        if not receipt_test_set:
            pytest.skip("No receipt test images available")

        from app.core.config import get_settings
        from app.llm.provider import LiteLLMReceiptExtractor

        extractor = LiteLLMReceiptExtractor(get_settings())
        consistent_count = 0

        for image_data, _truth in receipt_test_set:
            results = []
            for _ in range(self.RUNS_PER_RECEIPT):
                result = await extractor.extract(image_data, "image/jpeg")
                results.append(result.model_dump_json())

            if len(set(results)) == 1:
                consistent_count += 1

        total = len(receipt_test_set)
        consistency_rate = consistent_count / total if total > 0 else 1.0
        assert consistency_rate >= 0.95, (
            f"Consistency rate {consistency_rate:.2%} < 95% target"
        )
