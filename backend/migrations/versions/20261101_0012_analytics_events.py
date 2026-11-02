"""Analytics events: product events stored in our own database.

Until now events went only to the log, so nothing measured the MVP funnel.
The privacy policy says app activity stays with us and our hosting providers,
so the events stay in Postgres. A daily task purges rows past 13 months, and
deleting an account deletes its rows.

Revision ID: 20261101_0012
Revises: 20261030_0011
Create Date: 2026-11-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261101_0012"
down_revision: str | None = "20261030_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("event_name", sa.String(64), nullable=False),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column("device_type", sa.String(64), nullable=True),
        sa.Column("app_version", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_analytics_events_name_created",
        "analytics_events",
        ["event_name", "created_at"],
    )
    op.create_index(
        "ix_analytics_events_user_created",
        "analytics_events",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_events_user_created", table_name="analytics_events")
    op.drop_index("ix_analytics_events_name_created", table_name="analytics_events")
    op.drop_table("analytics_events")
