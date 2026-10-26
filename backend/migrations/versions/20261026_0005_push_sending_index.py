"""Push delivery: index rows a run claimed as `sending`.

Each push run settles rows a dead run left `sending` (see
app/tasks/push_tasks.py); this partial index keeps that query off a full scan.

Revision ID: 20261026_0005
Revises: 20261025_0004
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261026_0005"
down_revision: str | None = "20261025_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_notifications_push_sending",
        "notifications",
        ["created_at"],
        postgresql_where=sa.text("push_status = 'sending'"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_push_sending", table_name="notifications")
