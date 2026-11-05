"""The user's price alert cooldown (PI-03 AC 8, DA-4).

Adds ``users.price_alert_cooldown_days``: the days between two price change
alerts for one item, 1 to 30, or null for the server default
(``GG_PRICE_ALERT_COOLDOWN_DAYS``, 7). The column is nullable with no
backfill, so every existing user keeps the cooldown they had: the default.
A check constraint holds the range the API validates (1-30), copied here so
the migration stays as written if the app's range changes.

A downgrade drops the column, and with it every cooldown users saved: after
a re-upgrade everyone is back on the default.

Revision ID: 20261104_0022
Revises: 20261104_0021
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0022"
down_revision: str | None = "20261104_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CHECK = "ck_users_price_alert_cooldown_days"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("price_alert_cooldown_days", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        _CHECK, "users", "price_alert_cooldown_days BETWEEN 1 AND 30"
    )


def downgrade() -> None:
    op.drop_constraint(_CHECK, "users", type_="check")
    op.drop_column("users", "price_alert_cooldown_days")
