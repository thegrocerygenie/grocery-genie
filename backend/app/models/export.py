"""Rows of the data export (NFR Privacy 2, V11-P2): one model per entity.

The JSON export writes these as they are; the CSV files use the same fields,
in the same order, one file per entity (line items carry ``receipt_id``).
"""

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class ExportLineItem(BaseModel):
    id: uuid.UUID
    receipt_id: uuid.UUID
    position: int
    name: str
    quantity: float
    unit_price: float
    total_price: float
    unit_of_measure: str | None
    category: str | None
    canonical_item_id: uuid.UUID | None
    canonical_item_name: str | None
    corrected: bool


class ExportReceipt(BaseModel):
    id: uuid.UUID
    date: date
    store_name: str | None
    store_location: str | None
    subtotal: float | None
    tax: float | None
    total: float | None
    currency: str
    status: str
    created_at: datetime | None


class ExportReceiptWithLines(ExportReceipt):
    """A receipt in the JSON export, with its lines in receipt order."""

    line_items: list[ExportLineItem]


class ExportBudget(BaseModel):
    id: uuid.UUID
    # None: the overall budget.
    category: str | None
    category_id: uuid.UUID | None
    amount: float
    currency: str
    period_type: str
    period_start: date
    rollover_enabled: bool
    created_at: datetime | None


class ExportPriceObservation(BaseModel):
    id: uuid.UUID
    date: date
    canonical_item_id: uuid.UUID
    item_name: str
    store_name: str | None
    unit_price: float
    quantity: float
    unit_of_measure: str | None
    currency: str
    receipt_id: uuid.UUID
    line_item_id: uuid.UUID


class ExportCounts(BaseModel):
    """What one export held: the ``data_exported`` event's counts."""

    receipt_count: int = 0
    line_item_count: int = 0
    budget_count: int = 0
    price_observation_count: int = 0
