"""AI consent: record when a user allows receipts to go to third-party AI.

App Store 5.1.2(i): a scan sends the receipt photo and item names to
Anthropic, so the user must allow it first. No backfill: every existing
user is asked once before their next scan.

Revision ID: 20261027_0009
Revises: 20261026_0008
Create Date: 2026-10-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261027_0009"
down_revision: str | None = "20261026_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ai_consent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("ai_consent_version", sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "ai_consent_version")
    op.drop_column("users", "ai_consent_at")
