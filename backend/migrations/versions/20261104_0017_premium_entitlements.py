"""Premium entitlements from RevenueCat (V11-P0, decision D1).

users gets the entitlement (active, expiry, product) and the time of the
RevenueCat event that last set it, so an older event arriving late changes
nothing. revenuecat_events is the webhook's idempotency ledger: one row per
RevenueCat event id, so a retried delivery is a no-op.

Revision ID: 20261104_0017
Revises: 20261104_0016
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0017"
down_revision: str | None = "20261104_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "premium_active",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("premium_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("premium_product_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("premium_updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "revenuecat_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index("ix_revenuecat_events_user_id", "revenuecat_events", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_revenuecat_events_user_id", table_name="revenuecat_events")
    op.drop_table("revenuecat_events")
    op.drop_column("users", "premium_updated_at")
    op.drop_column("users", "premium_product_id")
    op.drop_column("users", "premium_expires_at")
    op.drop_column("users", "premium_active")
