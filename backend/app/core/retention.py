"""How long a soft-deleted receipt or budget stays restorable.

Restore, the "recently deleted" lists, and the purge task all read this one
window, so the purge never erases a row a user can still restore. A code
constant, not a setting: an env override on only the API or only the worker
would let the purge run ahead of restore. The in-app privacy text promises
30 days; change it with this value.
"""

from datetime import UTC, datetime, timedelta

RESTORE_WINDOW = timedelta(days=30)


def restore_cutoff(now: datetime | None = None) -> datetime:
    """Rows deleted before this are past restore; rows at or after it are not."""
    return (now or datetime.now(UTC)) - RESTORE_WINDOW


def days_remaining(deleted_at: datetime, now: datetime | None = None) -> int:
    """Whole days left to restore, as shown in Settings → Recently deleted."""
    if deleted_at.tzinfo is None:  # SQLite drops the zone; the value is UTC
        deleted_at = deleted_at.replace(tzinfo=UTC)
    now = now or datetime.now(UTC)
    return max(0, RESTORE_WINDOW.days - (now - deleted_at).days)
