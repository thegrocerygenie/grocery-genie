import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

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


class ReceiptExtraction(BaseModel):
    store_name: str
    date: str
    items: list[LineItemExtraction]
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    currency: str = "USD"
    confidence: float


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


class ReceiptUpdateRequest(BaseModel):
    items: list[LineItemCorrection] | None = None
    status: str | None = None


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


class DashboardTrendMonth(BaseModel):
    period: str
    spent: float
    budget: float | None = None


class DashboardSpendingResponse(BaseModel):
    period: str
    overall: BudgetOverallSummary
    categories: list[BudgetCategorySummary]
    top_items: list[DashboardTopItem]
    trend: list[DashboardTrendMonth]


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


class AppleSignInRequest(BaseModel):
    identity_token: str
    authorization_code: str
    nonce: str | None = None
    name: str | None = None


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


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    locale: str
    currency_preference: str
    email_verified_at: datetime | None
    preferences: UserPreferencesPublic
    needs_onboarding: bool = False


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
