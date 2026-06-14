"""H6: LLM output validation and rule-based fallback."""

import pytest
from pydantic import ValidationError

from app.llm.provider import RuleBasedCategoryAssigner
from app.llm.schemas import (
    CategoryAssignmentList,
    ExtractedLineItem,
    ReceiptExtractionResult,
)


def _item(**overrides) -> dict:
    base = {
        "name": "Item",
        "quantity": 1.0,
        "unit_price": 1.0,
        "total_price": 1.0,
        "confidence": 0.9,
    }
    base.update(overrides)
    return base


# --- Schema validators now produce observable effects ---


def test_price_drift_flags_warning_and_lowers_confidence():
    item = ExtractedLineItem(
        name="Apples", quantity=2.0, unit_price=1.0, total_price=5.0, confidence=0.95
    )
    assert item.warnings  # 2x1=2 expected, got 5 → >2% drift
    assert item.confidence <= 0.5


def test_price_within_tolerance_keeps_confidence():
    item = ExtractedLineItem(
        name="Apples", quantity=2.0, unit_price=1.0, total_price=2.0, confidence=0.95
    )
    assert item.warnings == []
    assert item.confidence == 0.95


def test_future_date_flags_warning_and_lowers_confidence():
    result = ReceiptExtractionResult(
        store_name="S", date="2999-01-01", items=[_item()], confidence=0.95
    )
    assert any("future" in w for w in result.warnings)
    assert result.confidence <= 0.5


def test_unparseable_date_flags_warning():
    result = ReceiptExtractionResult(
        store_name="S", date="15/03/2026", items=[_item()], confidence=0.95
    )
    assert any("unparseable" in w for w in result.warnings)


def test_subtotal_mismatch_flags_warning_and_lowers_confidence():
    result = ReceiptExtractionResult(
        store_name="S",
        date="2026-03-15",
        items=[_item(total_price=1.0)],
        subtotal=10.0,
        confidence=0.95,
    )
    assert any("subtotal" in w for w in result.warnings)
    assert result.confidence <= 0.6


def test_clean_receipt_has_no_warnings():
    result = ReceiptExtractionResult(
        store_name="S",
        date="2026-03-15",
        items=[_item(total_price=2.0, quantity=2.0)],
        subtotal=2.0,
        confidence=0.95,
    )
    assert result.warnings == []
    assert result.confidence == 0.95


# --- Category-assignment output validation ---


def test_category_assignment_list_validates_well_formed():
    parsed = CategoryAssignmentList.model_validate(
        [{"name": "Milk", "category": "Groceries", "confidence": 0.8}]
    )
    assert parsed.root[0].category == "Groceries"


def test_category_assignment_rejects_missing_category():
    with pytest.raises(ValidationError):
        CategoryAssignmentList.model_validate([{"name": "Milk"}])


def test_category_assignment_rejects_out_of_range_confidence():
    with pytest.raises(ValidationError):
        CategoryAssignmentList.model_validate(
            [{"name": "Milk", "category": "Groceries", "confidence": 5.0}]
        )


def test_category_assignment_rejects_non_array():
    with pytest.raises(ValidationError):
        CategoryAssignmentList.model_validate({"name": "Milk", "category": "X"})


# --- Rule-based fallback ---


@pytest.mark.asyncio
async def test_rule_based_assigner_maps_known_keywords():
    out = await RuleBasedCategoryAssigner().assign(
        ["Whole Milk 1 Gal", "Sparkling Water", "Paper Towels 6pk", "Dog Food"]
    )
    by_name = {a["name"]: a["category"] for a in out}
    assert by_name["Whole Milk 1 Gal"] == "Groceries"
    assert by_name["Sparkling Water"] == "Beverages"
    assert by_name["Paper Towels 6pk"] == "Household"
    assert by_name["Dog Food"] == "Pet"


@pytest.mark.asyncio
async def test_rule_based_assigner_defaults_unknown_to_other():
    out = await RuleBasedCategoryAssigner().assign(["Mystery Widget XYZ"])
    assert out[0]["category"] == "Other"
    assert out[0]["confidence"] < 0.7
