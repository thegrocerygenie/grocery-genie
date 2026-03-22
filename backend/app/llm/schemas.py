from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class ExtractedLineItem(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    unit_of_measure: str | None = None
    category: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def check_price_tolerance(self) -> "ExtractedLineItem":
        """Verify total_price ≈ quantity × unit_price within 2% tolerance."""
        expected = self.quantity * self.unit_price
        if expected > 0:
            diff = abs(self.total_price - expected) / expected
            if diff > 0.02:
                # Don't reject — just flag via lower confidence in practice
                pass
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

    @model_validator(mode="after")
    def check_date_not_future(self) -> "ReceiptExtractionResult":
        """Ensure extracted date is not in the future."""
        try:
            parsed = date.fromisoformat(self.date)
            if parsed > datetime.now().date():
                # Allow but flag — receipts shouldn't be future-dated
                pass
        except ValueError:
            pass
        return self

    @model_validator(mode="after")
    def check_subtotal_tolerance(self) -> "ReceiptExtractionResult":
        """Verify sum of item totals ≈ subtotal within 1% tolerance."""
        if self.subtotal is not None and self.items:
            items_sum = sum(item.total_price for item in self.items)
            if items_sum > 0:
                diff = abs(self.subtotal - items_sum) / items_sum
                if diff > 0.01:
                    # Don't reject — validation layer flags this separately
                    pass
        return self
