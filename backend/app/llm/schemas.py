from datetime import date, datetime

from pydantic import BaseModel, Field, RootModel, model_validator

# How far each validation issue pulls confidence down. Drift is a signal the
# extraction may be wrong, so we cap (never raise) confidence when detected.
_PRICE_DRIFT_CONFIDENCE_CAP = 0.5
_SUBTOTAL_DRIFT_CONFIDENCE_CAP = 0.6
_FUTURE_DATE_CONFIDENCE_CAP = 0.5
_PRICE_TOLERANCE = 0.02
_SUBTOTAL_TOLERANCE = 0.01
# Receipt-level fields scored on their own (RC-02 AC 2).
_FIELD_CONFIDENCES = ("store_name_confidence", "date_confidence", "total_confidence")


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
    # The prompt asks for null on a field the model can't read, so null store,
    # null date and no items are answers to flag or reject, not invalid output
    # (a validation error becomes a 503 that the app keeps retrying).
    store_name: str | None = None
    date: str | None = None
    currency: str = "USD"
    items: list[ExtractedLineItem] = Field(default_factory=list)
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    # Per-field scores for the review screen. None when the model omits one,
    # which the client treats as "not flagged".
    store_name_confidence: float | None = None
    date_confidence: float | None = None
    total_confidence: float | None = None
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def clamp_field_confidences(self) -> "ReceiptExtractionResult":
        """Clamp out-of-range field scores to 0-1 rather than fail the scan."""
        for field in _FIELD_CONFIDENCES:
            value = getattr(self, field)
            if value is not None and not 0.0 <= value <= 1.0:
                clamped = min(max(value, 0.0), 1.0)
                self.warnings.append(f"{field} {value} out of range; using {clamped}")
                setattr(self, field, clamped)
        return self

    @model_validator(mode="after")
    def check_store_name_present(self) -> "ReceiptExtractionResult":
        """Flag a missing store name and score it 0 so review flags the row."""
        if self.store_name is not None and self.store_name.strip():
            return self
        self.store_name = None
        self.warnings.append("missing store name")
        self.store_name_confidence = 0.0
        return self

    @model_validator(mode="after")
    def check_date_not_future(self) -> "ReceiptExtractionResult":
        """Flag missing / future / unparseable dates and lower confidence."""
        if self.date is None:
            self.warnings.append("missing date")
            self._cap_date_confidence()
            return self
        try:
            parsed = date.fromisoformat(self.date)
        except ValueError:
            self.warnings.append(f"unparseable date: {self.date!r}")
            self._cap_date_confidence()
            return self
        if parsed > datetime.now().date():
            self.warnings.append(f"future-dated receipt: {self.date}")
            self._cap_date_confidence()
        return self

    def _cap_date_confidence(self) -> None:
        self.confidence = min(self.confidence, _FUTURE_DATE_CONFIDENCE_CAP)
        # A missing or unparseable date is stored as today, so the Date row needs a
        # low score even when the model gave none.
        self.date_confidence = min(
            self.date_confidence if self.date_confidence is not None else 1.0,
            _FUTURE_DATE_CONFIDENCE_CAP,
        )

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
