"""Currency codes and money text (RC-05, rank 13)."""

import pytest

from app.core.money import format_money, normalize_currency


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ("USD", "USD"),
        (" eur ", "EUR"),
        ("€", "EUR"),
        ("£", "GBP"),
        ("₹", "INR"),
        ("CHF", "CHF"),
    ],
)
def test_normalizes_codes_and_unambiguous_symbols(raw, code):
    assert normalize_currency(raw) == code


@pytest.mark.parametrize("raw", [None, "", "$", "¥", "dollars", "EURO", "12A"])
def test_rejects_missing_ambiguous_or_unknown_values(raw):
    """$ and ¥ name several currencies: the caller falls back to the user's."""
    assert normalize_currency(raw) is None


@pytest.mark.parametrize(
    ("amount", "currency", "decimals", "text"),
    [
        (12.5, "USD", 2, "$12.50"),
        (12.5, "EUR", 2, "€12.50"),
        (12.5, "GBP", 2, "£12.50"),
        (1200, "JPY", 0, "¥1200"),
        (12.5, "CHF", 2, "CHF 12.50"),
        (-3, "USD", 2, "-$3.00"),
        (40, "USD", 0, "$40"),
    ],
)
def test_formats_money_with_the_currency(amount, currency, decimals, text):
    assert format_money(amount, currency, decimals=decimals) == text
