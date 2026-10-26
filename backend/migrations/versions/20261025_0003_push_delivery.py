"""Push delivery: push_tokens table and notifications.push_status.

Revision ID: 20261025_0003
Revises: 20260613_0002
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261025_0003"
down_revision: str | None = "20260613_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])

    op.add_column(
        "notifications", sa.Column("push_status", sa.String(length=20), nullable=True)
    )
    # Notifications that exist before push delivery are never pushed.
    op.execute("UPDATE notifications SET push_status = 'expired'")
    op.create_index(
        "ix_notifications_push_pending",
        "notifications",
        ["created_at"],
        postgresql_where=sa.text("push_status IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_push_pending", table_name="notifications")
    op.drop_column("notifications", "push_status")
    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_table("push_tokens")
