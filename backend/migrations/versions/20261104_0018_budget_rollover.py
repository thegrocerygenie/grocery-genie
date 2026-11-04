"""Budget rollover (V11-P3, BC-FR Budget Management; Premium, decision D2).

budgets already has rollover_enabled (the toggle, always false until now: no
route set it). Two columns hold the current rollover run, from which every
carry is derived (app/services/budget_service.py):

- rollover_start: a day in the first period of the run; NULL while off;
- rollover_opening: what carries into that first period. 0, unless an amount
  or start-day change restarted the run with the carry it had reached.

Revision ID: 20261104_0018
Revises: 20261104_0017
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0018"
down_revision: str | None = "20261104_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("rollover_start", sa.Date(), nullable=True))
    op.add_column(
        "budgets",
        sa.Column(
            "rollover_opening",
            sa.Numeric(12, 2),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("budgets", "rollover_opening")
    op.drop_column("budgets", "rollover_start")
