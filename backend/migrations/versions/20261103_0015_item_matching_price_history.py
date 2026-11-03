"""Item matching and price history (V1.1, PI-01 and PI-02).

canonical_items is each user's product registry. canonical_item_aliases holds
the names receipts gave each product, with a pgvector embedding of the name
for semantic matching. price_observations holds one price per confirmed line
item. item_match_suggestions holds medium-confidence matches waiting for the
user. line_items.canonical_item_id existed without a foreign key; it gets one,
and the line records how it was matched.

Semantic lookups stay inside one user's aliases (WHERE user_id = ...), so
they scan that user's rows by ix_canonical_item_aliases_user rather than an
HNSW index: an approximate index filtered to one user can return no
neighbours at all.

Revision ID: 20261103_0015
Revises: 20261102_0014
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "20261103_0015"
down_revision: str | None = "20261102_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMBEDDING_DIMENSIONS = 384


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "canonical_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=True),
        sa.Column("canonical_name", sa.String(255), nullable=False),
        sa.Column("unit_of_measure", sa.String(50), nullable=True),
        _created_at(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_canonical_items_user_id", "canonical_items", ["user_id"])

    op.create_table(
        "canonical_item_aliases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("canonical_item_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("alias", sa.String(500), nullable=False),
        sa.Column("normalized_name", sa.String(500), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=True),
        _created_at(),
        sa.ForeignKeyConstraint(
            ["canonical_item_id"], ["canonical_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "normalized_name", name="uq_canonical_alias_user_name"
        ),
    )
    op.create_index(
        "ix_canonical_item_aliases_canonical_item_id",
        "canonical_item_aliases",
        ["canonical_item_id"],
    )

    op.create_table(
        "price_observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=True),
        sa.Column("canonical_item_id", sa.Uuid(), nullable=False),
        sa.Column("receipt_id", sa.Uuid(), nullable=False),
        sa.Column("line_item_id", sa.Uuid(), nullable=False),
        sa.Column("store_id", sa.Uuid(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=False),
        sa.Column("unit_of_measure", sa.String(50), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["canonical_item_id"], ["canonical_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["receipt_id"], ["receipts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["line_item_id"], ["line_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("line_item_id"),
    )
    op.create_index(
        "ix_price_observations_item_date",
        "price_observations",
        ["canonical_item_id", "date"],
    )
    op.create_index("ix_price_observations_user", "price_observations", ["user_id"])
    op.create_index(
        "ix_price_observations_receipt_id", "price_observations", ["receipt_id"]
    )

    op.create_table(
        "item_match_suggestions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("suggested_item_id", sa.Uuid(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        _created_at(),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["item_id"], ["canonical_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["suggested_item_id"], ["canonical_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "item_id", "suggested_item_id", name="uq_item_match_suggestion_pair"
        ),
    )
    op.create_index(
        "ix_item_match_suggestions_user_status",
        "item_match_suggestions",
        ["user_id", "status"],
    )

    # No line item points at a canonical item yet: nothing wrote the column.
    op.execute("UPDATE line_items SET canonical_item_id = NULL")
    op.create_foreign_key(
        "fk_line_items_canonical_item_id",
        "line_items",
        "canonical_items",
        ["canonical_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_line_items_canonical_item_id", "line_items", ["canonical_item_id"]
    )
    op.add_column("line_items", sa.Column("match_confidence", sa.Float()))
    op.add_column("line_items", sa.Column("match_method", sa.String(16)))


def downgrade() -> None:
    op.drop_column("line_items", "match_method")
    op.drop_column("line_items", "match_confidence")
    op.drop_index("ix_line_items_canonical_item_id", table_name="line_items")
    op.drop_constraint(
        "fk_line_items_canonical_item_id", "line_items", type_="foreignkey"
    )
    op.drop_table("item_match_suggestions")
    op.drop_table("price_observations")
    op.drop_table("canonical_item_aliases")
    op.drop_table("canonical_items")
    # The vector extension stays: other objects in the database may use it.
