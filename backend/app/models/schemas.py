import datetime as dt
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core import clock
from app.models.category_looks import (
    CUSTOM_COLORS,
    CUSTOM_ICONS,
    DEFAULT_COLOR,
    DEFAULT_ICON,
)
from app.models.database import (
    PRICE_ALERT_COOLDOWN_MAX_DAYS,
    PRICE_ALERT_COOLDOWN_MIN_DAYS,
)

_CURRENCY_CODE = re.compile(r"^[A-Z]{3}$")

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
    # PI-02: the product this line was matched to once the receipt was
    # confirmed; the app opens its price history from here.
    canonical_item_id: uuid.UUID | None = None


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
    # The period's limit: the amount plus what rolled over into it.
    budget: float
    spent: float
    remaining: float
    percent: float
    # What rolled over from earlier periods (Premium rollover, V11-P3); 0
    # without rollover. ``budget - rolled_over`` is the budget's own amount.
    rolled_over: float = 0.0


class BudgetUpdateRequest(BaseModel):
    amount: float = Field(gt=0)
    # Moves the period start (and so the start day) when given (BC-02 AC 3).
    period_start: date | None = None


class BudgetRolloverRequest(BaseModel):
    """PUT /api/budgets/{id}/rollover: carry unspent budget forward (Premium)."""

    enabled: bool


class BudgetCategorySummary(BaseModel):
    category_id: uuid.UUID
    name: str
    # As in BudgetOverallSummary: the amount plus what rolled over.
    budget: float
    spent: float
    remaining: float
    percent: float
    rolled_over: float = 0.0
    # The category's look, for the dashboard's bars (BC-05 AC 7, DA-9).
    color: str = DEFAULT_COLOR
    icon: str = DEFAULT_ICON


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
    # First and last day of ``period``, from the overall budget's reset day.
    period_start: date
    period_end: date
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
    # BC-05 AC 5 (DA-9): names from app.models.category_looks.
    color: str
    icon: str


# Longest custom category name; it has to fit a budget row and a chart legend.
CATEGORY_NAME_MAX = 40


def _category_name(value: str) -> str:
    name = " ".join(value.split())
    if not name:
        raise ValueError("name must not be blank")
    if len(name) > CATEGORY_NAME_MAX:
        raise ValueError(f"name must be at most {CATEGORY_NAME_MAX} characters")
    return name


# A custom category's colour and icon (BC-05 AC 5): only names from the
# allowed sets, so the server never stores what the app cannot draw.
CategoryColor = Literal[*CUSTOM_COLORS]  # type: ignore[valid-type]
CategoryIcon = Literal[*CUSTOM_ICONS]  # type: ignore[valid-type]


class CategoryCreateRequest(BaseModel):
    """A custom category (BC-05 AC 3, Premium). Whitespace is collapsed.

    ``color`` and ``icon`` default to the first of each set (BC-05 AC 5).
    """

    name: str
    color: CategoryColor = DEFAULT_COLOR
    icon: CategoryIcon = DEFAULT_ICON

    _check_name = field_validator("name")(_category_name)


class CategoryUpdateRequest(BaseModel):
    """Rename and/or restyle a custom category; send at least one field.

    A field left out keeps its value; ``null`` is refused like any value
    outside the allowed sets.
    """

    name: str | None = None
    color: CategoryColor | None = None
    icon: CategoryIcon | None = None

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("name must not be null")
        return _category_name(value)

    @field_validator("color", "icon")
    @classmethod
    def _not_null(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("must not be null")
        return value

    @model_validator(mode="after")
    def _something_to_change(self) -> "CategoryUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("send a name, a color or an icon")
        return self


# --- Common ---


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


# --- Auth ---


def _is_time_zone(name: str) -> bool:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def _time_zone(value: str | None) -> str | None:
    """An IANA time zone name; anything else is a 422."""
    if value is not None and not _is_time_zone(value):
        raise ValueError("timezone must be an IANA time zone, such as Europe/Berlin")
    return value


def _device_time_zone(value: str | None) -> str | None:
    """The device's time zone at sign-up. A bad value is dropped, as for the
    currency: the account keeps UTC."""
    return value if value is not None and _is_time_zone(value) else None


def _device_currency(value: str | None) -> str | None:
    """The device's currency at sign-up. A bad value is dropped, not a 422:
    sign-up never fails over it, and the account keeps the USD default."""
    if value is None:
        return None
    code = value.strip().upper()
    return code if _CURRENCY_CODE.match(code) else None


class SignUpRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    # The iPhone's region currency; becomes the budget currency.
    currency_preference: str | None = None
    # The iPhone's IANA time zone; the weekly summary goes out at 9 AM in it.
    timezone: str | None = None

    _check_currency = field_validator("currency_preference")(_device_currency)
    _check_time_zone = field_validator("timezone")(_device_time_zone)


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
    # Used only when this sign-in creates the account.
    currency_preference: str | None = None
    timezone: str | None = None

    _check_currency = field_validator("currency_preference")(_device_currency)
    _check_time_zone = field_validator("timezone")(_device_time_zone)


class GoogleSignInRequest(BaseModel):
    id_token: str
    # Used only when this sign-in creates the account.
    currency_preference: str | None = None
    timezone: str | None = None

    _check_currency = field_validator("currency_preference")(_device_currency)
    _check_time_zone = field_validator("timezone")(_device_time_zone)


class EmailChangeRequestPayload(BaseModel):
    new_email: str
    current_password: str


class EmailChangeConfirmPayload(BaseModel):
    token: str


# --- Waitlist free year of Premium (V11-P5) ---


class WaitlistClaimRequest(BaseModel):
    """The email the user joined the waitlist with."""

    email: str = Field(max_length=320)


class WaitlistClaimConfirmRequest(BaseModel):
    token: str = Field(max_length=256)


class WaitlistRedemptionPublic(BaseModel):
    # pending: matched, the RevenueCat grant is being retried. granted: done.
    # failed: it could not be applied; the app says to contact support.
    status: Literal["pending", "granted", "failed"]
    # When the free year ends: 12 months from the match.
    expires_at: datetime | None


class WaitlistOfferResponse(BaseModel):
    window_open: bool
    # Show "Claim your waitlist offer": the window is open and this account
    # has no free year yet.
    claim_available: bool
    closes_at: datetime | None
    redemption: WaitlistRedemptionPublic | None


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
    # BC-03 AC 4: categories whose budgets send no alerts.
    muted_alert_categories: list[uuid.UUID] = Field(default_factory=list)


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
    timezone: str = "UTC"
    email_verified_at: datetime | None
    preferences: UserPreferencesPublic
    needs_onboarding: bool = False
    ai_consent: AiConsentPublic
    # Premium (V11-P0), from RevenueCat's webhook and REST API only.
    is_premium: bool = False
    premium_expires_at: datetime | None = None


# --- Premium: the RevenueCat webhook (V11-P0) ---


class RevenueCatWebhookEvent(BaseModel):
    """The fields of a RevenueCat webhook event the backend reads.

    RevenueCat sends many more; they are ignored. Times are epoch milliseconds.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=64)
    app_user_id: str | None = None
    original_app_user_id: str | None = None
    aliases: list[str] | None = None
    entitlement_ids: list[str] | None = None
    # Older payloads name a single entitlement.
    entitlement_id: str | None = None
    product_id: str | None = None
    expiration_at_ms: int | None = None
    event_timestamp_ms: int | None = None
    # Why a CANCELLATION happened. CUSTOMER_SUPPORT is a refund, which ends
    # access now; UNSUBSCRIBE and the rest keep it to the period's end.
    cancel_reason: str | None = Field(default=None, max_length=64)
    transferred_from: list[str] | None = None
    transferred_to: list[str] | None = None
    environment: str | None = None


class RevenueCatWebhookBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    api_version: str | None = None
    event: RevenueCatWebhookEvent


class RevenueCatWebhookResponse(BaseModel):
    # applied, duplicate, stale, ignored, unknown_user
    status: str


def _currency_code(value: str | None) -> str | None:
    """An ISO 4217 code, upper-cased; anything else is a 422."""
    if value is None:
        return None
    code = value.strip().upper()
    if not _CURRENCY_CODE.match(code):
        raise ValueError("currency must be a 3-letter ISO 4217 code")
    return code


class UserPreferencesUpdate(BaseModel):
    locale: str | None = None
    # The budget currency: only receipts in it count toward budgets.
    currency_preference: str | None = None
    # IANA name; the app sends it when the iPhone's time zone changes.
    timezone: str | None = None
    notification_thresholds: NotificationThresholds | None = None
    weekly_summary: WeeklySummaryUpdate | None = None
    ocr_languages: list[str] | None = None
    # Replaces the whole list. Category ids whose budgets send no alerts.
    muted_alert_categories: list[uuid.UUID] | None = None

    _check_currency = field_validator("currency_preference")(_currency_code)
    _check_time_zone = field_validator("timezone")(_time_zone)


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
    # None: the user's currency.
    currency: str | None = None
    items: list[ManualLineItem] = Field(default_factory=list)

    _check_currency = field_validator("currency")(_currency_code)


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


# --- Price Intelligence (V1.1: PI-01 price history, PI-02 item matching) ---


class ItemRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    canonical_name: str


class ItemAliasResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    alias: str


class LatestPrice(BaseModel):
    unit_price: float
    unit_of_measure: str | None = None
    currency: str
    date: date
    store_name: str | None = None


class ItemSummaryResponse(BaseModel):
    id: uuid.UUID
    canonical_name: str
    unit_of_measure: str | None = None
    observation_count: int
    store_count: int
    latest_price: LatestPrice | None = None
    # PI-02 AC 11, 15 (DA-6): "N purchases · $X avg": the mean unit price of
    # the prices in the unit and currency most of them are in, to the cent.
    avg_unit_price: float | None = None


class ItemListResponse(BaseModel):
    items: list[ItemSummaryResponse]
    total: int
    page: int
    per_page: int
    # Medium-confidence matches waiting for the user (PI-02 AC 2).
    pending_suggestions: int


class SuggestionReceiptLine(BaseModel):
    """The receipt line that raised a suggestion, as the receipt printed it
    (PI-02 AC 5): the "Same item?" prompt's first card."""

    receipt_id: uuid.UUID
    name: str
    store_name: str | None
    date: date


class SuggestedItemStats(BaseModel):
    """The existing item a suggestion would merge into (PI-02 AC 5): the
    caller's own purchases of it, the stores they were at, and the mean
    unit price in the unit and currency most of its prices are in."""

    purchase_count: int
    store_count: int
    avg_unit_price: float | None
    unit_of_measure: str | None
    currency: str | None


class ItemSuggestionResponse(BaseModel):
    id: uuid.UUID
    item: ItemRef
    suggested_item: ItemRef
    confidence: float
    method: str
    # PI-02 AC 8 (DA-5): what the "Same item?" prompt shows. None only when
    # the item has no line on a receipt the user can see.
    receipt_line: SuggestionReceiptLine | None = None
    suggested_item_stats: SuggestedItemStats | None = None


class ItemDetailResponse(ItemSummaryResponse):
    aliases: list[ItemAliasResponse]
    # "Is this the same as …?" questions about this item.
    suggestions: list[ItemSuggestionResponse]
    # PI-03 AC 4: the user muted price change alerts for this item (a live
    # mute: one that has ended is not muted, AC 12).
    alerts_muted: bool = False
    # PI-03 AC 11 (DA-7): when the mute ends, in UTC; null when it is
    # forever or the item is not muted.
    muted_until: datetime | None = None


class PricePointResponse(BaseModel):
    receipt_id: uuid.UUID
    # PI-02 AC 10 (DA-6): the receipt line, which a split by line moves, and
    # its name as the receipt printed it.
    line_item_id: uuid.UUID
    line_name: str
    date: date
    store_id: uuid.UUID | None = None
    store_name: str | None = None
    unit_price: float
    quantity: float
    unit_of_measure: str | None = None
    currency: str
    # False for a price in another unit or currency than the timeline's: it
    # is listed but not plotted (only like-for-like prices compare).
    in_timeline: bool


class PriceHistoryResponse(BaseModel):
    item: ItemRef
    unit_of_measure: str | None = None
    currency: str | None = None
    # PI-01 AC 4: false until the timeline has min_points prices.
    has_timeline: bool
    min_points: int
    store_count: int
    observations: list[PricePointResponse]


class StorePriceResponse(BaseModel):
    store_id: uuid.UUID
    store_name: str
    latest_price: float
    latest_date: date
    avg_price: float
    observation_count: int


class PriceComparisonResponse(BaseModel):
    """PI-04: the item's price at each store, cheapest first by average."""

    item: ItemRef
    # Only prices in this unit and currency are compared (like for like).
    unit_of_measure: str | None = None
    currency: str | None = None
    min_observations: int
    stores: list[StorePriceResponse]
    # Stores with a price of the item but fewer than min_observations.
    stores_below_minimum: int


class ItemRenameRequest(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=255)

    @field_validator("canonical_name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class ItemSplitPart(BaseModel):
    """One new item of a split by line (PI-02 AC 11, 14)."""

    name: str = Field(min_length=1, max_length=255)
    line_item_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)

    @field_validator("name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class ItemSplitRequest(BaseModel):
    splits: list[ItemSplitPart] = Field(min_length=1, max_length=10)


class ItemSplitResponse(BaseModel):
    # The new items, in the order of the request's splits.
    items: list[ItemDetailResponse]


class LinkCandidatesResponse(BaseModel):
    """The Link items sheet (PI-02 AC 15)."""

    # The item's pending suggestions, then the most similar names.
    suggested: list[ItemSummaryResponse]
    # Every other item, most recently bought first.
    items: list[ItemSummaryResponse]


class ItemMergeRequest(BaseModel):
    # The item this one is the same product as; it keeps its name.
    into_item_id: uuid.UUID


# --- Price change alerts (PI-03) ---


class StoreRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


# --- Stores: normalization and user merge (EC Price Intelligence 1) ---


class StoreSummaryResponse(BaseModel):
    """One of the user's stores as their prices group it."""

    id: uuid.UUID
    name: str
    # Not-deleted receipts in the group.
    receipt_count: int
    # Stores the user merged into this one; each can be unmerged.
    merged_stores: list[StoreRef]


class StoreListResponse(BaseModel):
    stores: list[StoreSummaryResponse]


class StoreMergeRequest(BaseModel):
    # The store this one is the same store as; its name is kept.
    into_store_id: uuid.UUID


class MutedItemResponse(ItemRef):
    # PI-03 AC 11 (DA-7): when the mute ends (UTC); null is forever.
    muted_until: datetime | None = None


class MutedStoreResponse(StoreRef):
    muted_until: datetime | None = None


class MuteRequest(BaseModel):
    """PI-03 AC 11 (DA-7): the body of a mute POST, which is optional. No
    ``until``, or null, is forever. A time with no offset is taken as UTC;
    one not in the future is 422."""

    until: datetime | None = None

    @field_validator("until")
    @classmethod
    def _in_the_future(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        value = (
            value.replace(tzinfo=dt.UTC)
            if value.tzinfo is None
            else value.astimezone(dt.UTC)
        )
        if value <= clock.now():
            raise ValueError("until must be in the future")
        return value


class PriceAlertSettingsResponse(BaseModel):
    enabled: bool
    # The user's threshold, or the default when they have not set one.
    threshold_percent: int
    default_threshold_percent: int
    # The user's cooldown in days (PI-03 AC 8), or the default.
    cooldown_days: int
    default_cooldown_days: int
    # Live mutes only, each with its end (PI-03 AC 11, 12).
    muted_items: list[MutedItemResponse]
    muted_stores: list[MutedStoreResponse]


class PriceAlertSettingsUpdate(BaseModel):
    """Fields left out stay as they are; a null threshold or cooldown goes
    back to the default."""

    enabled: bool | None = None
    threshold_percent: int | None = Field(default=None, ge=1, le=100)
    # PI-03 AC 8: 1-30 days (the app offers 1, 3, 7, 14 and 30).
    cooldown_days: int | None = Field(
        default=None,
        strict=True,
        ge=PRICE_ALERT_COOLDOWN_MIN_DAYS,
        le=PRICE_ALERT_COOLDOWN_MAX_DAYS,
    )
