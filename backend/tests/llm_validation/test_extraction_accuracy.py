import os

import pytest

LLM_CONFIGURED = bool(os.environ.get("GG_LLM_API_KEY"))


def score_store_name(extracted: str, expected: str) -> bool:
    """Exact match after normalization."""
    return extracted.strip().lower() == expected.strip().lower()


def score_date(extracted: str, expected: str) -> bool:
    """Exact date match (ISO format)."""
    return extracted == expected


def score_numeric(
    extracted: float | None,
    expected: float | None,
    tolerance: float = 0.02,
) -> bool:
    """Numeric match within tolerance."""
    if extracted is None and expected is None:
        return True
    if extracted is None or expected is None:
        return False
    if expected == 0:
        return extracted == 0
    return abs(extracted - expected) / abs(expected) <= tolerance


def score_line_items(extracted: list[dict], expected: list[dict]) -> dict:
    """Score line items: fuzzy name match + numeric tolerance.

    Returns dict with matched, missed, hallucinated, field_accuracy.
    """
    matched = 0
    field_correct = 0
    field_total = 0
    matched_expected_indices: set[int] = set()

    for ext_item in extracted:
        ext_name = ext_item.get("name", "").strip().lower()
        best_match_idx = None
        best_similarity = 0.0

        for i, exp_item in enumerate(expected):
            if i in matched_expected_indices:
                continue
            exp_name = exp_item.get("name", "").strip().lower()
            # Simple substring/containment match
            if ext_name == exp_name:
                similarity = 1.0
            elif ext_name in exp_name or exp_name in ext_name:
                similarity = 0.8
            else:
                # Word overlap
                ext_words = set(ext_name.split())
                exp_words = set(exp_name.split())
                if ext_words and exp_words:
                    overlap = len(ext_words & exp_words)
                    similarity = overlap / max(len(ext_words), len(exp_words))
                else:
                    similarity = 0.0

            if similarity > best_similarity:
                best_similarity = similarity
                best_match_idx = i

        if best_match_idx is not None and best_similarity >= 0.5:
            matched += 1
            matched_expected_indices.add(best_match_idx)
            exp_item = expected[best_match_idx]

            for numeric_field in (
                "quantity",
                "unit_price",
                "total_price",
            ):
                field_total += 1
                if score_numeric(
                    ext_item.get(numeric_field),
                    exp_item.get(numeric_field),
                ):
                    field_correct += 1

    missed = len(expected) - matched
    hallucinated = len(extracted) - matched

    return {
        "matched": matched,
        "missed": missed,
        "hallucinated": hallucinated,
        "field_correct": field_correct,
        "field_total": field_total,
        "field_accuracy": (field_correct / field_total if field_total > 0 else 1.0),
    }


@pytest.mark.skipif(not LLM_CONFIGURED, reason="LLM API key not configured")
class TestExtractionAccuracy:
    """Extraction accuracy tests — require real LLM calls.

    Targets (MVP launch):
    - >=90% field-level accuracy
    - 0% hallucination rate
    - >=95% item recall
    """

    async def test_field_level_accuracy(self, receipt_test_set):
        """Target: >=90% field-level accuracy."""
        if not receipt_test_set:
            pytest.skip("No receipt test images available")

        from app.core.config import get_settings
        from app.llm.provider import LiteLLMReceiptExtractor

        extractor = LiteLLMReceiptExtractor(get_settings())
        total_correct = 0
        total_fields = 0

        for image_data, truth in receipt_test_set:
            result = await extractor.extract(image_data, "image/jpeg")
            extracted_items = [item.model_dump() for item in result.items]
            scores = score_line_items(extracted_items, truth["items"])
            total_correct += scores["field_correct"]
            total_fields += scores["field_total"]

            total_fields += 2
            if score_store_name(result.store_name, truth["store_name"]):
                total_correct += 1
            if score_date(result.date, truth["date"]):
                total_correct += 1

        accuracy = total_correct / total_fields if total_fields > 0 else 0
        assert accuracy >= 0.90, f"Field accuracy {accuracy:.2%} < 90% target"

    async def test_zero_hallucination_rate(self, receipt_test_set):
        """Target: 0% hallucination rate."""
        if not receipt_test_set:
            pytest.skip("No receipt test images available")

        from app.core.config import get_settings
        from app.llm.provider import LiteLLMReceiptExtractor

        extractor = LiteLLMReceiptExtractor(get_settings())
        total_hallucinated = 0
        total_extracted = 0

        for image_data, truth in receipt_test_set:
            result = await extractor.extract(image_data, "image/jpeg")
            extracted_items = [item.model_dump() for item in result.items]
            scores = score_line_items(extracted_items, truth["items"])
            total_hallucinated += scores["hallucinated"]
            total_extracted += len(extracted_items)

        hallucination_rate = (
            total_hallucinated / total_extracted if total_extracted > 0 else 0
        )
        assert hallucination_rate == 0, (
            f"Hallucination rate {hallucination_rate:.2%} > 0% target"
        )

    async def test_item_recall(self, receipt_test_set):
        """Target: >=95% item recall."""
        if not receipt_test_set:
            pytest.skip("No receipt test images available")

        from app.core.config import get_settings
        from app.llm.provider import LiteLLMReceiptExtractor

        extractor = LiteLLMReceiptExtractor(get_settings())
        total_matched = 0
        total_expected = 0

        for image_data, truth in receipt_test_set:
            result = await extractor.extract(image_data, "image/jpeg")
            extracted_items = [item.model_dump() for item in result.items]
            scores = score_line_items(extracted_items, truth["items"])
            total_matched += scores["matched"]
            total_expected += len(truth["items"])

        recall = total_matched / total_expected if total_expected > 0 else 0
        assert recall >= 0.95, f"Item recall {recall:.2%} < 95% target"
