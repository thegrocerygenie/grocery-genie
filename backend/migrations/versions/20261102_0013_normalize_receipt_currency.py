"""Receipt currency as an ISO 4217 code.

Before prompt v3 the extractor could return a symbol ("€") or a lower-case
code. Budgets now count only receipts in the user's currency, compared by
code, and the app formats money from the code. This sets each receipt's
currency to a code: a known one-currency symbol becomes its code, a 3-letter
value is upper-cased, and anything else takes the owner's currency.
Running it again changes nothing.

Revision ID: 20261102_0013
Revises: 20261101_0012
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261102_0013"
down_revision: str | None = "20261101_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept in step with app/core/money.py _SYMBOLS.
_SYMBOLS = {
    "€": "EUR",
    "£": "GBP",
    "₹": "INR",
    "₩": "KRW",
    "₺": "TRY",
    "₽": "RUB",
    "₱": "PHP",
    "₪": "ILS",
    "₫": "VND",
    "₦": "NGN",
}


def upgrade() -> None:
    bind = op.get_bind()
    for symbol, code in _SYMBOLS.items():
        bind.execute(
            sa.text(
                "UPDATE receipts SET currency = :code WHERE trim(currency) = :symbol"
            ),
            {"code": code, "symbol": symbol},
        )
    bind.execute(
        sa.text(
            "UPDATE receipts SET currency = upper(trim(currency)) "
            "WHERE upper(trim(currency)) ~ '^[A-Z]{3}$' "
            "AND currency <> upper(trim(currency))"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE receipts SET currency = users.currency_preference "
            "FROM users WHERE users.id = receipts.user_id "
            "AND receipts.currency !~ '^[A-Z]{3}$'"
        )
    )


def downgrade() -> None:
    # The old values carried no information the codes lost.
    pass
