"""Currency codes and money text.

Receipts keep the currency printed on them. Budgets are in the user's
currency (users.currency_preference), and only receipts in that currency
count toward them (MVP rule, 2026-11-02; docs/prd/11-edge-cases.md).
"""

import re

_CODE = re.compile(r"^[A-Z]{3}$")

# Symbols that name one currency. "$" and "¥" name several (USD, CAD, AUD...;
# JPY, CNY), so they are left to the caller's fallback: the user's currency.
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

# Symbols for money text. Any other code is written before the amount.
_DISPLAY = {"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "INR": "₹", "KRW": "₩"}


def normalize_currency(raw: str | None) -> str | None:
    """An ISO 4217 code from a code or an unambiguous symbol, else None."""
    if raw is None:
        return None
    value = raw.strip()
    if value in _SYMBOLS:
        return _SYMBOLS[value]
    value = value.upper()
    return value if _CODE.match(value) else None


def format_money(amount: float, currency: str, *, decimals: int = 2) -> str:
    """Money text for notifications and labels: "$12.50", "€12.50",
    "CHF 12.50"."""
    number = f"{abs(amount):.{decimals}f}"
    sign = "-" if amount < 0 else ""
    symbol = _DISPLAY.get(currency)
    if symbol:
        return f"{sign}{symbol}{number}"
    return f"{sign}{currency} {number}"
