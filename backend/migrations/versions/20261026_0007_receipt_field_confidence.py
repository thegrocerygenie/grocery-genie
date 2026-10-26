"""Receipt field confidence: score store, date and total on their own.

The review screen flags each of these rows when its extraction confidence is
below 0.7 (RC-02 AC 2). Stored so a scan reopened from History is flagged too.
Nullable: older receipts and manual entries have no score, so are not flagged.

Revision ID: 20261026_0007
Revises: 20261026_0006
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261026_0007"
down_revision: str | None = "20261026_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = ("store_name_confidence", "date_confidence", "total_confidence")


def upgrade() -> None:
    for column in _COLUMNS:
        op.add_column("receipts", sa.Column(column, sa.Float(), nullable=True))


def downgrade() -> None:
    for column in reversed(_COLUMNS):
        op.drop_column("receipts", column)
