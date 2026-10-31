import datetime as dt
import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- Receipt Extraction (from scan endpoint) ---


class LineItemExtraction(BaseModel):
    id: uuid.UUID | None = None
    name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    category_id: uuid.UUID | None = None
    category_confidence: float | None = None
    extraction_confidence: float | None = None
    # What the extraction checks found (price drift), for review.
    warnings: list[str] = Field(default_factory=list)


class ReceiptExtraction(BaseModel):
    store_name: str | None = None
    date: str
    items: list[LineItemExtraction]
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    currency: str = "USD"
    confidence: float
    store_name_confidence: float | None = None
    date_confidence: float | None = None
    total_confidence: float | None = None
    # Receipt-level findings: subtotal drift, a missing store, a bad date.
    warnings: list[str] = Field(default_factory=list)


class ReceiptScanResponse(BaseModel):
    receipt_id: uuid.UUID
    status: str
    extraction: ReceiptExtraction
    duplicate_warning: bool = False


# --- Receipt CRUD ---


class LineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    raw_name: str
    quantity: float
    unit_price: float
    total_price: float
    unit_of_measure: str | None = None
    category_id: uuid.UUID | None = None
    category_confidence: float | None = None
    extraction_confidence: float | None = None
    corrected: bool = False


class ReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    store_name: str | None = None
    date: date
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    currency: str
    image_url: str | None = None
    extraction_confidence: float | None = None
    store_name_confidence: float | None = None
    date_confidence: float | None = None
    total_confidence: float | None = None
    status: str
    items: list[LineItemResponse] = []
    created_at: datetime | None = None


class ReceiptListResponse(BaseModel):
    items: list[ReceiptResponse]
    total: int
    page: int
    per_page: int


class LineItemCorrection(BaseModel):
    id: uuid.UUID
    name: str | None = None
    category_id: uuid.UUID | None = None
    quantity: float | None = Field(default=None, gt=0)
    total_price: float | None = Field(default=None, ge=0)


class ReceiptUpdateRequest(BaseModel):
    store_name: str | None = Field(default=None, min_length=1, max_length=255)
    # dt.date: a bare `date` here would resolve to this field, not the type.
    date: dt.date | None = None
    items: list[LineItemCorrection] | None = None
    # A confirmed receipt stays confirmed: update_receipt refuses to move it.
    status: Literal["pending_review", "confirmed"] | None = None

    @field_validator("date")
    @classmethod
    def date_not_in_future(cls, value: dt.date | None) -> dt.date | None:
        # One day of slack: the phone's local date can be ahead of server UTC.
        if value is not None and value > date.today() + timedelta(days=1):
            raise ValueError("Receipt date cannot be in the future")
        return value


# --- Budget ---


class BudgetCreateRequest(BaseModel):
    category_id: uuid.UUID | None = None
    amount: float
    period_type: str = "monthly"
    period_start: str


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID | None = None
    amount: float
    period_type: str
    period_start: date
    rollover_enabled: bool


class BudgetOverallSummary(BaseModel):
    budget: float
    spent: float
    remaining: float
    percent: float


class BudgetUpdateRequest(BaseModel):
    amount: float = Field(gt=0)
    # Moves the period start (and so the start day) when given (BC-02 AC 3).
    period_start: date | None = None


class BudgetCategorySummary(BaseModel):
    category_id: uuid.UUID
    name: str
    budget: float
    spent: float
    remaining: float
    percent: float


class BudgetSummaryResponse(BaseModel):
    period: str
    overall: BudgetOverallSummary
    categories: list[BudgetCategorySummary]


# --- Dashboard ---


class DashboardTopItem(BaseModel):
    name: str
    total_spent: float
    count: int
    # The category holding most of the item's spend; None when uncategorized.
    category_id: uuid.UUID | None = None
    category_name: str | None = None


class DashboardTrendCategory(BaseModel):
    """One category's share of a trend month. ``category_id`` is None for
    uncategorized spend, so the shares add up to the month's total."""

    category_id: uuid.UUID | None
    name: str
    spent: float


class DashboardTrendMonth(BaseModel):
    period: str
    spent: float
    budget: float | None = None
    categories: list[DashboardTrendCategory] = []


class DashboardCategoryChange(BaseModel):
    """One category's spend in the period and in the month before it (BC-04)."""

    category_id: uuid.UUID
    name: str
    spent: float
    previous_spent: float


class DashboardSpendingResponse(BaseModel):
    period: str
    overall: BudgetOverallSummary
    categories: list[BudgetCategorySummary]
    top_items: list[DashboardTopItem]
    trend: list[DashboardTrendMonth]
    # Mean monthly spend over the 3 months before the trend window, so the
    # trend's average can be compared with it. 0.0 when there was none.
    prior_average: float = 0.0
    previous_period: str
    category_changes: list[DashboardCategoryChange]
    # Whether the user has any receipt (not in Recently Deleted), in any
    # period. The app's "Scan your first receipt" state is for new accounts.
    has_receipts: bool = False


# --- Notification ---


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str
    data: str | None = None
    read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    per_page: int


# --- Category ---


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_default: bool
    sort_order: int


# --- Common ---


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


# --- Auth ---


class SignUpRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class SignInRequest(BaseModel):
    email: str
    password: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    needs_onboarding: bool = False


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class DeleteAccountRequest(BaseModel):
    # Sign in with Apple accounts only: a fresh code to revoke the grant.
    apple_authorization_code: str | None = None


class AppleSignInRequest(BaseModel):
    identity_token: str
    authorization_code: str
    nonce: str | None = None
    # No name: the app asks Apple for the email only (data minimization).
    # Older builds still send one; it is ignored as an unknown field.


class GoogleSignInRequest(BaseModel):
    id_token: str


class EmailChangeRequestPayload(BaseModel):
    new_email: str
    current_password: str


class EmailChangeConfirmPayload(BaseModel):
    token: str


# --- User profile + preferences ---


class NotificationThresholds(BaseModel):
    fifty: bool | None = None
    eighty: bool | None = None
    hundred: bool | None = None


class WeeklySummaryUpdate(BaseModel):
    enabled: bool | None = None
    day: int | None = Field(default=None, ge=0, le=6)


class UserPreferencesPublic(BaseModel):
    notification_thresholds: dict
    weekly_summary: dict
    ocr_languages: list[str] = Field(default_factory=list)


class AiConsentPublic(BaseModel):
    """Consent to send receipts to third-party AI (app/services/ai_consent.py)."""

    granted: bool
    granted_at: datetime | None
    policy_version: str | None
    current_policy_version: str


class AiConsentGrantRequest(BaseModel):
    # The policy version of the text the app showed the user.
    policy_version: str = Field(min_length=1, max_length=32)


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    locale: str
    currency_preference: str
    email_verified_at: datetime | None
    preferences: UserPreferencesPublic
    needs_onboarding: bool = False
    ai_consent: AiConsentPublic


class UserPreferencesUpdate(BaseModel):
    locale: str | None = None
    currency_preference: str | None = None
    notification_thresholds: NotificationThresholds | None = None
    weekly_summary: WeeklySummaryUpdate | None = None
    ocr_languages: list[str] | None = None


# --- Manual receipt ---


class ManualLineItem(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    category_id: uuid.UUID | None = None


class ManualReceiptCreateRequest(BaseModel):
    store_name: str
    date: date
    total: float
    subtotal: float | None = None
    tax: float | None = None
    currency: str = "USD"
    items: list[ManualLineItem] = Field(default_factory=list)


# --- Soft-delete listings ---


class DeletedItemResponse(BaseModel):
    id: uuid.UUID
    deleted_at: datetime
    days_remaining: int
    label: str  # human-readable summary
    type: str  # "receipt" | "budget"


# --- Analytics ---


class AnalyticsEventRequest(BaseModel):
    """A client-emitted analytics event.

    No ``user_id`` — it is derived from the authenticated JWT, never trusted
    from the request body. No ``timestamp`` — the analytics backend stamps
    events on receipt.
    """

    event_name: str = Field(..., min_length=1, max_length=64)
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


# --- Push tokens ---


class PushTokenPayload(BaseModel):
    # Expo push tokens look like ExponentPushToken[...] (older) or
    # ExpoPushToken[...] (newer).
    token: str = Field(
        min_length=1, max_length=255, pattern=r"^Expo(nent)?PushToken\[.+\]$"
    )
