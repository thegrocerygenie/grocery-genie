"""Initial baseline schema — core MVP tables.

Creates the pre-auth schema: users, stores, categories, receipts, line_items,
budgets, notifications, user_item_mappings. The auth/soft-delete/prefs delta is
applied by the follow-on revision 20260430_0001.

Revision ID: 20260418_0000
Revises:
Create Date: 2026-04-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20260418_0000"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── users (original columns; auth/prefs added in 20260430_0001) ──
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("api_token", sa.String(64), nullable=True),
        sa.Column("locale", sa.String(10), nullable=False, server_default="en_US"),
        sa.Column(
            "currency_preference",
            sa.String(3),
            nullable=False,
            server_default="USD",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_api_token", "users", ["api_token"], unique=True)

    # ── stores ──────────────────────────────────────────────────────
    op.create_table(
        "stores",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("normalized_name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_stores_normalized_name", "stores", ["normalized_name"])

    # ── categories ──────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "is_default", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("name", "user_id", name="uq_category_name_user"),
    )

    # ── receipts (deleted_at added in 20260430_0001) ────────────────
    op.create_table(
        "receipts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("household_id", sa.UUID(), nullable=True),
        sa.Column("store_id", sa.UUID(), sa.ForeignKey("stores.id"), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=True),
        sa.Column("tax", sa.Numeric(12, 2), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("thumbnail_url", sa.String(1000), nullable=True),
        sa.Column("extraction_confidence", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_receipts_user_date", "receipts", ["user_id", "date"])

    # ── line_items ──────────────────────────────────────────────────
    op.create_table(
        "line_items",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "receipt_id", sa.UUID(), sa.ForeignKey("receipts.id"), nullable=False
        ),
        sa.Column("raw_name", sa.String(500), nullable=False),
        sa.Column("canonical_item_id", sa.UUID(), nullable=True),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("unit_of_measure", sa.String(50), nullable=True),
        sa.Column(
            "category_id", sa.UUID(), sa.ForeignKey("categories.id"), nullable=True
        ),
        sa.Column("category_confidence", sa.Float(), nullable=True),
        sa.Column("extraction_confidence", sa.Float(), nullable=True),
        sa.Column("corrected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # ── budgets (deleted_at added in 20260430_0001) ─────────────────
    op.create_table(
        "budgets",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("household_id", sa.UUID(), nullable=True),
        sa.Column(
            "category_id", sa.UUID(), sa.ForeignKey("categories.id"), nullable=True
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column(
            "period_type", sa.String(20), nullable=False, server_default="monthly"
        ),
        sa.Column(
            "rollover_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "user_id",
            "category_id",
            "period_start",
            name="uq_budget_user_category_period",
        ),
    )

    # ── notifications ───────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.String(2000), nullable=False),
        sa.Column("data", sa.String(5000), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── user_item_mappings ──────────────────────────────────────────
    op.create_table(
        "user_item_mappings",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("raw_text_pattern", sa.String(500), nullable=False),
        sa.Column("canonical_item_id", sa.UUID(), nullable=True),
        sa.Column(
            "category_id", sa.UUID(), sa.ForeignKey("categories.id"), nullable=True
        ),
        sa.Column("confidence_override", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id",
            "raw_text_pattern",
            name="uq_user_item_mapping_user_pattern",
        ),
    )


def downgrade() -> None:
    op.drop_table("user_item_mappings")
    op.drop_table("notifications")
    op.drop_table("budgets")
    op.drop_table("line_items")
    op.drop_index("ix_receipts_user_date", table_name="receipts")
    op.drop_table("receipts")
    op.drop_table("categories")
    op.drop_index("ix_stores_normalized_name", table_name="stores")
    op.drop_table("stores")
    op.drop_index("ix_users_api_token", table_name="users")
    op.drop_table("users")
