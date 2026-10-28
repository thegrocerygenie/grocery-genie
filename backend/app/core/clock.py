"""The server's idea of today, in one place so tests can pin it."""

from datetime import date


def today() -> date:
    return date.today()
