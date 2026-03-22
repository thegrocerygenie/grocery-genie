import os

import pytest

LLM_CONFIGURED = bool(os.environ.get("GG_LLM_API_KEY"))


@pytest.mark.skipif(not LLM_CONFIGURED, reason="LLM API key not configured")
class TestPromptRegression:
    """Compare current prompt version against baseline metrics.

    Ensures no accuracy regression when prompts are updated.
    """

    BASELINE_FIELD_ACCURACY = 0.90
    BASELINE_ITEM_RECALL = 0.95
    BASELINE_HALLUCINATION_RATE = 0.0

    async def test_no_accuracy_regression(self, receipt_test_set):
        """Current prompt must meet or exceed baseline metrics."""
        if not receipt_test_set:
            pytest.skip("No receipt test images available")

        from app.core.config import get_settings
        from app.llm.provider import LiteLLMReceiptExtractor
        from tests.llm_validation.test_extraction_accuracy import (
            score_line_items,
        )

        extractor = LiteLLMReceiptExtractor(get_settings())
        total_correct = 0
        total_fields = 0
        total_matched = 0
        total_expected = 0
        total_hallucinated = 0
        total_extracted = 0

        for image_data, truth in receipt_test_set:
            result = await extractor.extract(image_data, "image/jpeg")
            extracted_items = [item.model_dump() for item in result.items]
            scores = score_line_items(extracted_items, truth["items"])

            total_correct += scores["field_correct"]
            total_fields += scores["field_total"]
            total_matched += scores["matched"]
            total_expected += len(truth["items"])
            total_hallucinated += scores["hallucinated"]
            total_extracted += len(extracted_items)

        field_accuracy = total_correct / total_fields if total_fields > 0 else 0
        recall = total_matched / total_expected if total_expected > 0 else 0
        hallucination_rate = (
            total_hallucinated / total_extracted if total_extracted > 0 else 0
        )

        assert field_accuracy >= self.BASELINE_FIELD_ACCURACY, (
            f"Field accuracy regressed: {field_accuracy:.2%} < "
            f"{self.BASELINE_FIELD_ACCURACY:.2%} baseline"
        )
        assert recall >= self.BASELINE_ITEM_RECALL, (
            f"Item recall regressed: {recall:.2%} < "
            f"{self.BASELINE_ITEM_RECALL:.2%} baseline"
        )
        assert hallucination_rate <= self.BASELINE_HALLUCINATION_RATE, (
            f"Hallucination rate regressed: "
            f"{hallucination_rate:.2%} > "
            f"{self.BASELINE_HALLUCINATION_RATE:.2%} baseline"
        )
