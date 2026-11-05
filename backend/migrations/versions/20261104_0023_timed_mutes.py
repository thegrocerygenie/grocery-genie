"""Timed price alert mutes (PI-03 AC 10-12, DA-7).

Adds ``muted_until`` (timestamptz, nullable) to ``price_alert_item_mutes``
and ``price_alert_store_mutes``: when the mute ends, in UTC, or null for
forever. The column has no default and no backfill, so every existing mute
reads as forever, as it worked before. Alerts compare it with the server
clock when a receipt is confirmed, so no job ends a mute.

A downgrade first deletes every timed mute, ended or not, then drops both
columns. The code before this revision has no end time, so a timed row left
in place would come back as a forever mute: an ended one would silence
alerts again, and a live one would never end. Dropping them errs towards
alerts (the default the user had before muting), and the user can mute
again. Forever mutes stay as they were.

Revision ID: 20261104_0023
Revises: 20261104_0022
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0023"
down_revision: str | None = "20261104_0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("price_alert_item_mutes", "price_alert_store_mutes")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("muted_until", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"DELETE FROM {table} WHERE muted_until IS NOT NULL"))
        op.drop_column(table, "muted_until")
