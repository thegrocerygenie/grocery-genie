import uuid
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ReceiptConfirmed:
    receipt_id: uuid.UUID
    user_id: uuid.UUID
    household_id: uuid.UUID | None
    store_id: uuid.UUID | None
    date: date
    line_items: list[dict]


@dataclass(frozen=True)
class ItemCorrected:
    line_item_id: uuid.UUID
    field: str  # "name" | "category_id" | "quantity" | "total_price"
    old_value: str
    new_value: str
    user_id: uuid.UUID


@dataclass(frozen=True)
class BudgetThresholdBreached:
    user_id: uuid.UUID
    budget_id: uuid.UUID
    threshold_percent: int  # 80 or 100
    current_spend: float
    budget_amount: float
    remaining_amount: float
    days_left_in_period: int
    period_start: date  # with budget_id + threshold: the once-per-period key
    category_id: uuid.UUID | None = None  # None for the overall budget


@dataclass(frozen=True)
class ItemMatched:
    """A confirmed line was linked to a canonical item (PI-02)."""

    line_item_id: uuid.UUID
    canonical_item_id: uuid.UUID
    match_confidence: float
    match_method: str  # alias | fuzzy | semantic | new | manual
