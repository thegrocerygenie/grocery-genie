"""Onboarding completed: record when a user finishes onboarding.

Skip on Set Budget finishes onboarding with no budget, so "has a monthly
budget" can no longer be the only sign that onboarding is done. Users who
already have an active monthly budget finished onboarding before this column
existed, so they are backfilled.

Revision ID: 20261026_0008
Revises: 20261026_0007
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261026_0008"
down_revision: str | None = "20261026_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE users SET onboarding_completed_at = now()
        WHERE onboarding_completed_at IS NULL
          AND EXISTS (
            SELECT 1 FROM budgets
            WHERE budgets.user_id = users.id
              AND budgets.period_type = 'monthly'
              AND budgets.deleted_at IS NULL
          )
        """
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed_at")
