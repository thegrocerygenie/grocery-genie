"""Phase A+B+C: auth columns, auth_events, prefs, soft-delete.

Revision ID: 20260430_0001
Revises: 20260418_0000
Create Date: 2026-04-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20260430_0001"
down_revision: str | None = "20260418_0000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── User auth columns ─────────────────────────────────────
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column("password_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("email_verification_token_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_verification_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "users", sa.Column("password_reset_token_hash", sa.String(64), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "password_reset_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column("users", sa.Column("pending_email", sa.String(255), nullable=True))
    op.add_column(
        "users", sa.Column("pending_email_token_hash", sa.String(64), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "pending_email_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "users", sa.Column("apple_subject", sa.String(255), nullable=True, unique=True)
    )
    op.add_column(
        "users", sa.Column("google_subject", sa.String(255), nullable=True, unique=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "failed_signin_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True)
    )

    # ── Notification + summary preferences ────────────────────
    op.add_column(
        "users",
        sa.Column(
            "notif_threshold_50",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notif_threshold_80",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notif_threshold_100",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "weekly_summary_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "weekly_summary_day",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "preferences",
            sa.JSON(),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "users", sa.Column("bounced_at", sa.DateTime(timezone=True), nullable=True)
    )

    # ── auth_events ───────────────────────────────────────────
    op.create_table(
        "auth_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("event_type", sa.String(40), nullable=False, index=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("event_metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_auth_events_user_created", "auth_events", ["user_id", "created_at"]
    )

    # ── Soft-delete columns ───────────────────────────────────
    op.add_column(
        "receipts", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_receipts_deleted_at", "receipts", ["deleted_at"])
    op.add_column(
        "budgets", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_budgets_deleted_at", "budgets", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_budgets_deleted_at", table_name="budgets")
    op.drop_column("budgets", "deleted_at")
    op.drop_index("ix_receipts_deleted_at", table_name="receipts")
    op.drop_column("receipts", "deleted_at")

    op.drop_index("ix_auth_events_user_created", table_name="auth_events")
    op.drop_table("auth_events")

    for col in (
        "bounced_at",
        "preferences",
        "weekly_summary_day",
        "weekly_summary_enabled",
        "notif_threshold_100",
        "notif_threshold_80",
        "notif_threshold_50",
        "locked_until",
        "failed_signin_count",
        "google_subject",
        "apple_subject",
        "pending_email_expires_at",
        "pending_email_token_hash",
        "pending_email",
        "password_reset_expires_at",
        "password_reset_token_hash",
        "email_verification_expires_at",
        "email_verification_token_hash",
        "email_verified_at",
        "password_updated_at",
        "password_hash",
    ):
        op.drop_column("users", col)
