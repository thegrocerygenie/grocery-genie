"""The user's time zone, for the weekly summary at 9 AM local time (BC-06).

The app sends the iPhone's IANA time zone at sign-up and when it changes.
Existing users get UTC, which is when summaries went out before.

Revision ID: 20261102_0014
Revises: 20261102_0013
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261102_0014"
down_revision: str | None = "20261102_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
