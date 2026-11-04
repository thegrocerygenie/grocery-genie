"""Store normalization and user store merge (V1.1, EC Price Intelligence 1, D3).

user_store_aliases holds each user's own store merges: the user's prices of
store_id group under target_store_id, and nobody else's. Stores are shared,
so a merge never renames or joins a shared row.

receipts.store_name is the store name printed on the receipt, or the user's
correction of it. Two users' receipts can share one store row (a row keeps
the name its first receipt gave it), so a receipt shows its own name, never
the row's. It is backfilled from each receipt's store row, the name those
receipts showed until now.

stores.normalized_name moves to the new normalization (case, accents,
punctuation and a branch marker at the end drop out: "LOBLAWS #1234" ->
"loblaws"), so new receipts find the existing row. Existing rows are kept,
never merged or deleted: receipts and prices keep pointing at the row they
were saved with, and rows that now share a normalized name group at read time
under the oldest of them (app/services/store_service.py). The downgrade puts
back the old lower(trim(name)).

The normalization below is a frozen copy of normalize_store_name as of this
revision, so a later change to the app cannot change what this migration did.

Revision ID: 20261104_0019
Revises: 20261104_0018
Create Date: 2026-11-04
"""

import re
import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0019"
down_revision: str | None = "20261104_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_END_MARKER = re.compile(
    r"(?<=\S)(?:"
    r"\s*#\s*\d+"
    r"|\s+[-–—]\s*#?\s*\d+"
    r"|\s+(?:store|str|no|number|branch|location|loc|unit)\.?\s*#?\s*\d+"
    r")\s*$"
)
_APOSTROPHES = re.compile(r"['‘’`]")
_NON_WORD = re.compile(r"[\W_]+")


def _normalize(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.casefold().strip()
    fallback = text
    while (stripped := _END_MARKER.sub("", text)) != text:
        text = stripped
    text = _APOSTROPHES.sub("", text)
    text = _NON_WORD.sub(" ", text).strip()
    return (text or fallback)[:255].strip()


_stores = sa.table(
    "stores",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("normalized_name", sa.String()),
)


def upgrade() -> None:
    op.create_table(
        "user_store_aliases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("store_id", sa.Uuid(), nullable=False),
        sa.Column("target_store_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_store_id"], ["stores.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "store_id", name="uq_user_store_alias"),
    )

    op.add_column("receipts", sa.Column("store_name", sa.String(255), nullable=True))
    op.execute(
        "UPDATE receipts SET store_name = "
        "(SELECT stores.name FROM stores WHERE stores.id = receipts.store_id) "
        "WHERE store_id IS NOT NULL"
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.select(_stores.c.id, _stores.c.name, _stores.c.normalized_name)
    )
    for store_id, name, normalized in rows.all():
        new = _normalize(name)
        if new != normalized:
            conn.execute(
                _stores.update()
                .where(_stores.c.id == store_id)
                .values(normalized_name=new)
            )


def downgrade() -> None:
    op.drop_column("receipts", "store_name")
    op.drop_table("user_store_aliases")
    op.execute("UPDATE stores SET normalized_name = lower(trim(name))")
