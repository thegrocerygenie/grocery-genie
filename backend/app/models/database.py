import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
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


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Legacy dev token — kept behind settings.DEBUG fallback during cutover.
    api_token: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    locale: Mapped[str] = mapped_column(String(10), default="en_US")
    currency_preference: Mapped[str] = mapped_column(String(3), default="USD")

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

    line_items: Mapped[list["LineItem"]] = relationship(back_populates="category")


class Receipt(Base):
    __tablename__ = "receipts"
    __table_args__ = (Index("ix_receipts_user_date", "user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    household_id: Mapped[uuid.UUID | None] = mapped_column()
    store_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stores.id"))
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
    canonical_item_id: Mapped[uuid.UUID | None] = mapped_column()
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
