from datetime import date, datetime

from pydantic import BaseModel, Field, RootModel, model_validator

# How far each validation issue pulls confidence down. Drift is a signal the
# extraction may be wrong, so we cap (never raise) confidence when detected.
_PRICE_DRIFT_CONFIDENCE_CAP = 0.5
_SUBTOTAL_DRIFT_CONFIDENCE_CAP = 0.6
_FUTURE_DATE_CONFIDENCE_CAP = 0.5
_PRICE_TOLERANCE = 0.02
_SUBTOTAL_TOLERANCE = 0.01


class ExtractedLineItem(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    unit_of_measure: str | None = None
    category: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    # Observable record of any drift the validators detected. Surfaced to the
    # user for review rather than silently discarded.
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_price_tolerance(self) -> "ExtractedLineItem":
        """Flag total_price ≉ quantity × unit_price (>2%) and lower confidence."""
        expected = self.quantity * self.unit_price
        if expected > 0:
            diff = abs(self.total_price - expected) / expected
            if diff > _PRICE_TOLERANCE:
                self.warnings.append(
                    f"price mismatch: {self.total_price} vs expected "
                    f"{round(expected, 2)} ({round(diff * 100, 1)}% off)"
                )
                self.confidence = min(self.confidence, _PRICE_DRIFT_CONFIDENCE_CAP)
        return self


class ReceiptExtractionResult(BaseModel):
    store_name: str
    date: str
    currency: str = "USD"
    items: list[ExtractedLineItem] = Field(min_length=1)
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_date_not_future(self) -> "ReceiptExtractionResult":
        """Flag future / unparseable dates and lower confidence."""
        try:
            parsed = date.fromisoformat(self.date)
        except ValueError:
            self.warnings.append(f"unparseable date: {self.date!r}")
            self.confidence = min(self.confidence, _FUTURE_DATE_CONFIDENCE_CAP)
            return self
        if parsed > datetime.now().date():
            self.warnings.append(f"future-dated receipt: {self.date}")
            self.confidence = min(self.confidence, _FUTURE_DATE_CONFIDENCE_CAP)
        return self

    @model_validator(mode="after")
    def check_subtotal_tolerance(self) -> "ReceiptExtractionResult":
        """Flag sum(item totals) ≉ subtotal (>1%) and lower confidence."""
        if self.subtotal is not None and self.items:
            items_sum = sum(item.total_price for item in self.items)
            if items_sum > 0:
                diff = abs(self.subtotal - items_sum) / items_sum
                if diff > _SUBTOTAL_TOLERANCE:
                    self.warnings.append(
                        f"subtotal mismatch: {self.subtotal} vs items sum "
                        f"{round(items_sum, 2)} ({round(diff * 100, 1)}% off)"
                    )
                    self.confidence = min(
                        self.confidence, _SUBTOTAL_DRIFT_CONFIDENCE_CAP
                    )
        return self


class CategoryAssignment(BaseModel):
    """One item → category decision returned by the category-assignment LLM."""

    name: str
    category: str
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class CategoryAssignmentList(RootModel[list[CategoryAssignment]]):
    """Validates the full category-assignment array before it touches the DB."""
