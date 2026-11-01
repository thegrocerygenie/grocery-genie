"""The extraction accuracy gate: field accuracy, hallucination, recall, latency.

These tests make live LLM calls, so they run only with a key and a paired test
set. Every test scores the same calls (see conftest.py). Run
``python -m tests.llm_validation.run extract`` for the full report.
"""

import pytest

from tests.llm_validation import harness
from tests.llm_validation.conftest import llm_configured

LLM_CONFIGURED = llm_configured()


def _misses(scores: list[harness.ReceiptScore]) -> str:
    lines = [
        f"{s.receipt_id}: {s.error or ', '.join(s.wrong_fields) or 'items'}"
        for s in scores
        if s.error or s.wrong_fields or s.matched < s.expected_items
    ]
    return "\n".join(lines[:20])


@pytest.mark.skipif(not LLM_CONFIGURED, reason="LLM API key not configured")
class TestExtractionAccuracy:
    async def test_field_level_accuracy(self, receipt_scores):
        metrics = harness.aggregate(receipt_scores)
        assert metrics.field_accuracy >= harness.FIELD_ACCURACY_TARGET, (
            f"Field accuracy {metrics.field_accuracy:.2%} < 90% target\n"
            + _misses(receipt_scores)
        )

    async def test_zero_hallucination_rate(self, receipt_scores):
        metrics = harness.aggregate(receipt_scores)
        offenders = [s.receipt_id for s in receipt_scores if s.hallucinated]
        assert metrics.hallucination_rate <= harness.HALLUCINATION_RATE_TARGET, (
            f"Hallucination rate {metrics.hallucination_rate:.2%} > 0% target: "
            + ", ".join(offenders)
        )

    async def test_item_recall(self, receipt_scores):
        metrics = harness.aggregate(receipt_scores)
        assert metrics.item_recall >= harness.ITEM_RECALL_TARGET, (
            f"Item recall {metrics.item_recall:.2%} < 95% target"
        )

    async def test_extraction_latency_p95(self, receipt_scores):
        """RC-01 AC 4 / NFR: image prep plus the model call, ≤5 s at p95."""
        metrics = harness.aggregate(receipt_scores)
        assert metrics.latency_p95_s is not None
        assert metrics.latency_p95_s <= harness.LATENCY_P95_TARGET_S, (
            f"Extraction p95 {metrics.latency_p95_s:.2f}s > 5s target"
        )
