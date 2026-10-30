"""Receipt extraction provenance: the model and prompt version that read it.

The default model, Claude Sonnet 5.5, has no dated snapshot ID to pin, so each
receipt records what read it. A change in extraction behavior can then be
traced to the receipts it touched. Existing and manual receipts stay NULL.

Revision ID: 20261030_0011
Revises: 20261028_0010
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "20261030_0011"
down_revision: str | None = "20261028_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "receipts", sa.Column("extraction_model", sa.String(100), nullable=True)
    )
    op.add_column(
        "receipts",
        sa.Column("extraction_prompt_version", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("receipts", "extraction_prompt_version")
    op.drop_column("receipts", "extraction_model")
