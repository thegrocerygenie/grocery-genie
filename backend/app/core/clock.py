"""The server's idea of today, in one place so tests can pin it."""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def today() -> date:
    return date.today()


def now() -> datetime:
    """The current instant, in UTC (the price alert cooldown runs on it)."""
    return datetime.now(UTC)


def user_zone(name: str | None) -> ZoneInfo:
    """The user's time zone; UTC for a missing or unknown name."""
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def today_in(zone_name: str | None) -> date:
    """Today where the user is, from their time zone name (UTC when unset)."""
    return now().astimezone(user_zone(zone_name)).date()
