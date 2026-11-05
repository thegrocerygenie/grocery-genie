import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.models.category_looks import DEFAULT_COLOR, DEFAULT_ICON
from app.models.types import EmbeddingVector


class Base(DeclarativeBase):
    pass


# The cooldown choices the API takes (PI-03 AC 8); the migration copies them.
PRICE_ALERT_COOLDOWN_MIN_DAYS = 1
PRICE_ALERT_COOLDOWN_MAX_DAYS = 30


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "price_alert_cooldown_days BETWEEN "
            f"{PRICE_ALERT_COOLDOWN_MIN_DAYS} AND {PRICE_ALERT_COOLDOWN_MAX_DAYS}",
            name="ck_users_price_alert_cooldown_days",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Legacy dev token — kept behind settings.DEBUG fallback during cutover.
    api_token: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    locale: Mapped[str] = mapped_column(String(10), default="en_US")
    currency_preference: Mapped[str] = mapped_column(String(3), default="USD")
    # IANA time zone from the iPhone; the weekly summary goes out at 9 AM in it.
    timezone: Mapped[str] = mapped_column(
        String(64), default="UTC", server_default="UTC", nullable=False
    )

    # Auth columns (Phase A)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    password_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verification_token_hash: Mapped[str | None] = mapped_column(String(64))
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    password_reset_token_hash: Mapped[str | None] = mapped_column(String(64))
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    pending_email: Mapped[str | None] = mapped_column(String(255))
    pending_email_token_hash: Mapped[str | None] = mapped_column(String(64))
    pending_email_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # "Claim your waitlist offer" (V11-P5): the waitlist email the user asked
    # to claim, until they tap the link sent to it (like pending_email).
    waitlist_claim_email: Mapped[str | None] = mapped_column(String(255))
    waitlist_claim_token_hash: Mapped[str | None] = mapped_column(String(64))
    waitlist_claim_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    apple_subject: Mapped[str | None] = mapped_column(String(255), unique=True)
    google_subject: Mapped[str | None] = mapped_column(String(255), unique=True)
    failed_signin_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_failed_signin_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Notification + summary preferences (Phase B — typed for hot-path query)
    notif_threshold_50: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    notif_threshold_80: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    notif_threshold_100: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    weekly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    weekly_summary_day: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )
    # Free-form prefs the server doesn't query (e.g., ocr_languages: list[str])
    preferences: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    bounced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set when the user finishes onboarding, with or without a budget (Skip).
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # Consent to send receipts to third-party AI (app/services/ai_consent.py).
    # Both null when the user has not allowed it or has withdrawn it.
    ai_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_consent_version: Mapped[str | None] = mapped_column(String(32))
    # Price change alerts (PI-03). A null threshold means the server default
    # (settings.price_alert_threshold_percent).
    price_alerts_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    price_alert_threshold_percent: Mapped[int | None] = mapped_column(SmallInteger)
    # Days between two alerts for one item (PI-03 AC 8, DA-4): 1-30, or null
    # for the server default (settings.price_alert_cooldown_days).
    price_alert_cooldown_days: Mapped[int | None] = mapped_column(SmallInteger)
    # Premium (V11-P0). Written only from RevenueCat (its webhook or REST
    # API), never from the app. Premium while active and before the expiry
    # (null: no expiry); read it through app.core.entitlements.is_premium.
    premium_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    premium_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    premium_product_id: Mapped[str | None] = mapped_column(String(255))
    # event_timestamp of the RevenueCat event (or REST read) that last set the
    # three columns above. An older event arriving late changes nothing.
    premium_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    receipts: Mapped[list["Receipt"]] = relationship(back_populates="user")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="user")
    item_mappings: Mapped[list["UserItemMapping"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
    auth_events: Mapped[list["AuthEvent"]] = relationship(back_populates="user")


class AuthEvent(Base):
    __tablename__ = "auth_events"
    __table_args__ = (Index("ix_auth_events_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    event_metadata: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User | None"] = relationship(back_populates="auth_events")


class AnalyticsEvent(Base):
    """A product analytics event (docs/prd/12-analytics.md).

    Kept analytics_event_retention_days (13 months), then purged; deleting the
    account deletes its events. device_type and app_version come from the
    app's X-Device-Type and X-App-Version headers, and are null without them.
    """

    __tablename__ = "analytics_events"
    __table_args__ = (
        Index("ix_analytics_events_name_created", "event_name", "created_at"),
        Index("ix_analytics_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    event_name: Mapped[str] = mapped_column(String(64), nullable=False)
    properties: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    device_type: Mapped[str | None] = mapped_column(String(64))
    app_version: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    location: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    receipts: Mapped[list["Receipt"]] = relationship(back_populates="store")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("name", "user_id", name="uq_category_name_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # BC-05 AC 5 (DA-9): names from app.models.category_looks. A row written
    # without them (as every custom category before DA-9) reads the defaults.
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default=DEFAULT_COLOR, server_default=DEFAULT_COLOR
    )
    icon: Mapped[str] = mapped_column(
        String(30), nullable=False, default=DEFAULT_ICON, server_default=DEFAULT_ICON
    )

    line_items: Mapped[list["LineItem"]] = relationship(back_populates="category")


class Receipt(Base):
    __tablename__ = "receipts"
    __table_args__ = (Index("ix_receipts_user_date", "user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    household_id: Mapped[uuid.UUID | None] = mapped_column()
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id"))
    # The store name printed on this receipt, or the user's correction of it.
    # The store row is shared and keeps the name its first receipt gave it,
    # so a receipt shows this, never the row's name (V11-05).
    store_name: Mapped[str | None] = mapped_column(String(255))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal: Mapped[float | None] = mapped_column(Numeric(12, 2))
    tax: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    image_url: Mapped[str | None] = mapped_column(String(1000))
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000))
    extraction_confidence: Mapped[float | None] = mapped_column(Float)
    store_name_confidence: Mapped[float | None] = mapped_column(Float)
    date_confidence: Mapped[float | None] = mapped_column(Float)
    total_confidence: Mapped[float | None] = mapped_column(Float)
    # What read a scanned receipt; NULL for manual entries and older receipts.
    extraction_model: Mapped[str | None] = mapped_column(String(100))
    extraction_prompt_version: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="receipts")
    store: Mapped["Store | None"] = relationship(back_populates="receipts")
    # In the order the receipt lists them (L2). Without an ORDER BY, Postgres
    # returns rows in storage order, and an edited row moved to the end.
    line_items: Mapped[list["LineItem"]] = relationship(
        back_populates="receipt",
        cascade="all, delete-orphan",
        order_by="LineItem.position",
    )


class LineItem(Base):
    __tablename__ = "line_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("receipts.id"), nullable=False
    )
    raw_name: Mapped[str] = mapped_column(String(500), nullable=False)
    # 0-based place on the receipt; Receipt.line_items orders by it.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # PI-02: the product this line is, set when its receipt is confirmed.
    canonical_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="SET NULL"), index=True
    )
    # How the line was matched: 0..1, and alias | fuzzy | semantic | new | manual.
    match_confidence: Mapped[float | None] = mapped_column(Float)
    match_method: Mapped[str | None] = mapped_column(String(16))
    quantity: Mapped[float] = mapped_column(Numeric(10, 3), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    unit_of_measure: Mapped[str | None] = mapped_column(String(50))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    category_confidence: Mapped[float | None] = mapped_column(Float)
    extraction_confidence: Mapped[float | None] = mapped_column(Float)
    corrected: Mapped[bool] = mapped_column(Boolean, default=False)

    receipt: Mapped["Receipt"] = relationship(back_populates="line_items")
    category: Mapped["Category | None"] = relationship(back_populates="line_items")


class ReceiptCorrection(Base):
    """One user edit of one extracted field (RC-02 AC 3). Append-only.

    Corrections overwrite receipts and line_items, so this row keeps the
    replaced value; the oldest row for a field holds the value as extracted.
    Receipt fields (store_name, date) have no line item.
    """

    __tablename__ = "receipt_corrections"
    __table_args__ = (
        Index("ix_receipt_corrections_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("line_items.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    household_id: Mapped[uuid.UUID | None] = mapped_column()
    # store_name | date | name | category_id | quantity | total_price
    field: Mapped[str] = mapped_column(String(32), nullable=False)
    original_value: Mapped[str] = mapped_column(Text, nullable=False)
    corrected_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "category_id",
            "period_start",
            name="uq_budget_user_category_period",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    household_id: Mapped[uuid.UUID | None] = mapped_column()
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_type: Mapped[str] = mapped_column(String(20), default="monthly")
    rollover_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # The current rollover run (Premium, V11-P3): a day in its first period,
    # and what carries into that period. Every later carry is derived from
    # these, the amount and the receipts (BudgetService.rollover_carry).
    rollover_start: Mapped[date | None] = mapped_column(Date)
    rollover_opening: Mapped[float] = mapped_column(
        Numeric(12, 2), default=0, server_default=text("0"), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="budgets")
    category: Mapped["Category | None"] = relationship()


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # The push beat polls pending rows every minute.
        Index(
            "ix_notifications_push_pending",
            "created_at",
            postgresql_where=text("push_status IS NULL"),
        ),
        # ...and settles rows a dead run left `sending`.
        Index(
            "ix_notifications_push_sending",
            "created_at",
            postgresql_where=text("push_status = 'sending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(String(2000), nullable=False)
    data: Mapped[str | None] = mapped_column(String(5000))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    # Push delivery: NULL = pending; sending = claimed by a run; then
    # sent | failed, or no_device | expired. See app/tasks/push_tasks.py.
    push_status: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="notifications")


class BudgetAlertSent(Base):
    """One row per budget threshold alert sent, so each fires once a period."""

    __tablename__ = "budget_alerts_sent"
    __table_args__ = (
        UniqueConstraint(
            "budget_id",
            "period_start",
            "threshold_percent",
            name="uq_budget_alert_sent",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    budget_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    threshold_percent: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PriceAlertSent(Base):
    """The last price change alert for each item: the cooldown ledger (PI-03).

    One row per item, so the cooldown claim is one upsert on the unique key:
    it inserts, or moves alerted_at when the last alert is older than the
    cooldown, and otherwise changes nothing. Two confirms at the same time
    cannot both alert for the same item.
    """

    __tablename__ = "price_alerts_sent"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    alerted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class PriceAlertItemMute(Base):
    """An item the user muted price change alerts for (PI-03 AC 4)."""

    __tablename__ = "price_alert_item_mutes"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "canonical_item_id", name="uq_price_alert_item_mute"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    item: Mapped["CanonicalItem"] = relationship()


class PriceAlertStoreMute(Base):
    """A store the user muted price change alerts for (PI-03 AC 4).

    Stores are shared across users; the mute is this user's alone.
    """

    __tablename__ = "price_alert_store_mutes"
    __table_args__ = (
        UniqueConstraint("user_id", "store_id", name="uq_price_alert_store_mute"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    store_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    # The user's own name for the store when they muted it (V11-05): the
    # mute outlives its receipts, and the shared row's name may be another
    # user's.
    store_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    store: Mapped["Store"] = relationship()


class UserStoreAlias(Base):
    """One user's merge of a store into another (EC Price Intelligence 1, D3).

    Stores are shared across users, so a merge never renames or joins the
    shared rows: it groups this user's prices of ``store_id`` under
    ``target_store_id``, and nobody else's. Both ids are group roots (the
    oldest row of their normalized name); a target is never itself merged,
    so groups are one level deep.
    """

    __tablename__ = "user_store_aliases"
    __table_args__ = (
        UniqueConstraint("user_id", "store_id", name="uq_user_store_alias"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    store_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    target_store_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    # The user's own names for both stores when they merged, so the group
    # keeps the user's name after their receipts there are purged; the shared
    # row's name may be another user's.
    store_name: Mapped[str | None] = mapped_column(String(255))
    target_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RevenueCatEvent(Base):
    """Every RevenueCat webhook delivery received: the idempotency ledger.

    RevenueCat retries a delivery until it gets a 200, so the same event id
    can arrive twice. The insert on the unique ``event_id`` is the claim: the
    second delivery finds the row and changes nothing.
    """

    __tablename__ = "revenuecat_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Null when no user matched the event's app user ids.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    # applied, stale, ignored, unknown_user (the webhook's response status).
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WaitlistEntry(Base):
    """A contact copied from the marketing site's waitlist (the Resend
    audience), for the free year of Premium (V11-P5, decision #7).

    ``email`` is trimmed and lowercased, as the site stores it. Kept only
    while the claim window is open (decision #11); then a daily task deletes
    every row.
    """

    __tablename__ = "waitlist_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    # When the contact joined the waitlist (Resend's created_at): only those
    # before settings.waitlist_cutoff qualify (decision #9).
    contact_created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Resend's unsubscribed flag. Unsubscribed contacts still qualify (#10).
    unsubscribed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WaitlistRedemption(Base):
    """One free year of Premium per waitlist email, ever (decisions #12, #13).

    ``email_hash`` is a salted, one-way hash of the matched waitlist email
    (``app.services.waitlist_service.hash_waitlist_email``), never the email
    itself; its unique key is the "once per waitlist email" rule, and the
    unique ``user_id`` the "once per account" rule. pending -> granted when
    RevenueCat accepts the promotional grant; a pending row is retried.

    Deleting the account keeps only the hash and the status, unlinked
    (``user_id`` null), until the claim window closes; then it is deleted.
    """

    __tablename__ = "waitlist_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )
    # pending, granted, failed (see last_error).
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    # What found the match: social_sign_in, verify_email, email_change,
    # backfill, claim.
    source: Mapped[str | None] = mapped_column(String(32))
    matched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The promotional grant's end: matched_at plus waitlist_free_months.
    grant_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # attempts and created_at are null on an unlinked row: decision #13 keeps
    # only the hash and the status after account deletion.
    attempts: Mapped[int | None] = mapped_column(
        Integer, default=0, server_default=text("0")
    )
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # pending -> granted, or failed: a RevenueCat 4xx (revenuecat_rejected_<code>),
    # gave_up_after_<n>_days or grant_end_passed; for pending, why the last try failed.
    last_error: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WaitlistAudiencePurge(Base):
    """The Resend audience's contacts were deleted after the claim window
    closed (V11-P5, decision #11): one row, written when a purge run finds
    the audience empty. The daily purge then stops calling Resend, so
    contacts the site adds later are not deleted as the waitlist."""

    __tablename__ = "waitlist_audience_purges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class PushToken(Base):
    """An Expo push token for one of the user's devices.

    A token identifies a device install, so it belongs to at most one user:
    signing in to another account on the same device moves it.
    """

    __tablename__ = "push_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserItemMapping(Base):
    __tablename__ = "user_item_mappings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "raw_text_pattern",
            name="uq_user_item_mapping_user_pattern",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    raw_text_pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    canonical_item_id: Mapped[uuid.UUID | None] = mapped_column()
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    confidence_override: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="item_mappings")
    category: Mapped["Category | None"] = relationship()


class CanonicalItem(Base):
    """One product in a user's item registry (PI-02).

    Each user has their own registry: merging or splitting items is the
    user's own call, and item names never cross accounts. household_id is
    there for V1.5. Line items and price observations point here.
    """

    __tablename__ = "canonical_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column()
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_of_measure: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    aliases: Mapped[list["CanonicalItemAlias"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="CanonicalItemAlias.created_at",
    )


class CanonicalItemAlias(Base):
    """A name a receipt gave a canonical item, e.g. "ORG BANANAS".

    normalized_name is unique per user, so a name always resolves to one item
    (the exact-alias step of matching). embedding is the name's sentence
    embedding for the semantic step; null until it is computed.
    """

    __tablename__ = "canonical_item_aliases"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "normalized_name", name="uq_canonical_alias_user_name"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    alias: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(500), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingVector())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    item: Mapped["CanonicalItem"] = relationship(back_populates="aliases")


class PriceObservation(Base):
    """One price paid for a canonical item (PI-01): one per confirmed line item.

    Rebuilt from the receipt whenever a confirmed receipt changes. Reads join
    receipts to leave out deleted ones, so deleting and restoring a receipt
    needs no change here.
    """

    __tablename__ = "price_observations"
    __table_args__ = (
        Index("ix_price_observations_item_date", "canonical_item_id", "date"),
        Index("ix_price_observations_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    household_id: Mapped[uuid.UUID | None] = mapped_column()
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="CASCADE"), nullable=False
    )
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("line_items.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    unit_of_measure: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    store: Mapped["Store | None"] = relationship()


class ItemMatchSuggestion(Base):
    """A medium-confidence match the user is asked to confirm (PI-02 AC 2).

    The line went to a new item (item_id); accepting merges that item into
    suggested_item_id, rejecting keeps the two apart.
    status: pending | accepted | rejected.
    """

    __tablename__ = "item_match_suggestions"
    __table_args__ = (
        UniqueConstraint(
            "item_id", "suggested_item_id", name="uq_item_match_suggestion_pair"
        ),
        Index("ix_item_match_suggestions_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="CASCADE"), nullable=False
    )
    suggested_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_items.id", ondelete="CASCADE"), nullable=False
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    item: Mapped["CanonicalItem"] = relationship(foreign_keys=[item_id])
    suggested_item: Mapped["CanonicalItem"] = relationship(
        foreign_keys=[suggested_item_id]
    )
