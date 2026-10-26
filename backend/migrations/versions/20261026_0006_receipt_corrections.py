"""Receipt corrections log: keep each extracted value a user corrects.

Corrections overwrite receipts and line_items, so each changed field gets an
append-only row holding the replaced and the new value (RC-02 AC 3).

Revision ID: 20261026_0006
Revises: 20261026_0005
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261026_0006"
down_revision: str | None = "20261026_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "receipt_corrections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("receipt_id", sa.Uuid(), nullable=False),
        sa.Column("line_item_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=True),
        sa.Column("field", sa.String(length=32), nullable=False),
        sa.Column("original_value", sa.Text(), nullable=False),
        sa.Column("corrected_value", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["receipt_id"], ["receipts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["line_item_id"], ["line_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_receipt_corrections_receipt_id", "receipt_corrections", ["receipt_id"]
    )
    op.create_index(
        "ix_receipt_corrections_user_created",
        "receipt_corrections",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_receipt_corrections_user_created", table_name="receipt_corrections"
    )
    op.drop_index("ix_receipt_corrections_receipt_id", table_name="receipt_corrections")
    op.drop_table("receipt_corrections")
