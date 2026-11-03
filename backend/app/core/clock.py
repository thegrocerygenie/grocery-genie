"""The server's idea of today, in one place so tests can pin it."""

from datetime import UTC, date, datetime


def today() -> date:
    return date.today()


def now() -> datetime:
    """The current instant, in UTC (the price alert cooldown runs on it)."""
    return datetime.now(UTC)
