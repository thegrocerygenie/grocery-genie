"""Price change alerts (V1.1, PI-03).

price_alerts_sent is the cooldown ledger: one row per canonical item holding
when it last alerted, so the claim is one upsert on the unique key and two
concurrent confirms cannot both alert. price_alert_item_mutes and
price_alert_store_mutes hold the user's mutes. users gets the on/off switch
and the user's own threshold (null: the server default).

Revision ID: 20261104_0016
Revises: 20261103_0015
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0016"
down_revision: str | None = "20261103_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "price_alerts_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("price_alert_threshold_percent", sa.SmallInteger(), nullable=True),
    )

    op.create_table(
        "price_alerts_sent",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("canonical_item_id", sa.Uuid(), nullable=False),
        sa.Column("alerted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["canonical_item_id"], ["canonical_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("canonical_item_id"),
    )
    op.create_index("ix_price_alerts_sent_user_id", "price_alerts_sent", ["user_id"])

    op.create_table(
        "price_alert_item_mutes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("canonical_item_id", sa.Uuid(), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["canonical_item_id"], ["canonical_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "canonical_item_id", name="uq_price_alert_item_mute"
        ),
    )

    op.create_table(
        "price_alert_store_mutes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("store_id", sa.Uuid(), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "store_id", name="uq_price_alert_store_mute"),
    )


def downgrade() -> None:
    op.drop_table("price_alert_store_mutes")
    op.drop_table("price_alert_item_mutes")
    op.drop_index("ix_price_alerts_sent_user_id", table_name="price_alerts_sent")
    op.drop_table("price_alerts_sent")
    op.drop_column("users", "price_alert_threshold_percent")
    op.drop_column("users", "price_alerts_enabled")
