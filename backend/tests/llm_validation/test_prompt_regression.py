import pytest

from tests.llm_validation import harness
from tests.llm_validation.conftest import llm_configured

LLM_CONFIGURED = llm_configured()


@pytest.mark.skipif(not LLM_CONFIGURED, reason="LLM API key not configured")
class TestPromptRegression:
    """The current prompt must meet the baseline on every language, not only on
    the whole set: a prompt change that helps English can hurt German."""

    BASELINE_FIELD_ACCURACY = harness.FIELD_ACCURACY_TARGET
    BASELINE_ITEM_RECALL = harness.ITEM_RECALL_TARGET
    BASELINE_HALLUCINATION_RATE = harness.HALLUCINATION_RATE_TARGET

    async def test_no_accuracy_regression_in_any_language(self, receipt_scores):
        regressed = [
            f"{lang}: accuracy {m.field_accuracy:.2%}, recall {m.item_recall:.2%}, "
            f"hallucination {m.hallucination_rate:.2%}"
            for lang, m in harness.metrics_by_language(receipt_scores).items()
            if m.field_accuracy < self.BASELINE_FIELD_ACCURACY
            or m.item_recall < self.BASELINE_ITEM_RECALL
            or m.hallucination_rate > self.BASELINE_HALLUCINATION_RATE
        ]
        assert not regressed, "Below baseline:\n" + "\n".join(regressed)
