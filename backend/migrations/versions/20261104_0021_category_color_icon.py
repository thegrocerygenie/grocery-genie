"""Category colour and icon (BC-05 AC 5, DA-9).

Adds ``categories.color`` and ``categories.icon``: names from
``app.models.category_looks``, never hex codes or symbol names. Both are NOT
NULL with a server default, so every existing custom category gets the first
palette colour ("indigo", the colour the app drew custom categories in) and
the default icon ("tag"), as 11-edge-cases.md (Premium 5) says. The eight
built-ins get their fixed looks, matched by name.

The values are copied here, not imported, so the migration stays as written
if the allowed sets change later.

Revision ID: 20261104_0021
Revises: 20261104_0020
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0021"
down_revision: str | None = "20261104_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BUILT_IN_LOOKS = {
    "Groceries": ("green", "cart"),
    "Household": ("blue", "house"),
    "Personal Care": ("pink", "heart"),
    "Beverages": ("indigo", "cup"),
    "Snacks & Treats": ("orange", "cake"),
    "Baby & Kids": ("yellow", "family"),
    "Pet": ("teal", "paw"),
    "Other": ("gray", "tag"),
}


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column(
            "color", sa.String(length=20), nullable=False, server_default="indigo"
        ),
    )
    op.add_column(
        "categories",
        sa.Column("icon", sa.String(length=30), nullable=False, server_default="tag"),
    )
    categories = sa.table(
        "categories",
        sa.column("name", sa.String),
        sa.column("is_default", sa.Boolean),
        sa.column("color", sa.String),
        sa.column("icon", sa.String),
    )
    for name, (color, icon) in _BUILT_IN_LOOKS.items():
        op.execute(
            categories.update()
            .where(categories.c.is_default.is_(True), categories.c.name == name)
            .values(color=color, icon=icon)
        )


def downgrade() -> None:
    op.drop_column("categories", "icon")
    op.drop_column("categories", "color")
