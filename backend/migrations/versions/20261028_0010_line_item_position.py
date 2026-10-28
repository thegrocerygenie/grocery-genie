"""Line item position: keep a receipt's items in its own order (L2).

Postgres returned items in storage order, so an edited item moved to the
end of its receipt. Existing rows get positions from their current
storage order (ctid), the order the app showed them in until now.

Revision ID: 20261028_0010
Revises: 20261027_0009
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261028_0010"
down_revision: str | None = "20261027_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "line_items",
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        UPDATE line_items AS li
        SET position = ordered.position
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY receipt_id ORDER BY ctid) - 1
                       AS position
            FROM line_items
        ) AS ordered
        WHERE li.id = ordered.id
        """
    )


def downgrade() -> None:
    op.drop_column("line_items", "position")
