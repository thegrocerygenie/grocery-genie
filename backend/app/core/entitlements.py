"""Premium entitlement: the one place the backend asks "is this user Premium?".

Premium (decision D2, 2026-11-03) gates the V1.1 extras: the 12-month
spending trend, custom categories, data export, budget rollover and unlimited
receipts. Decision D8 (2026-11-04, PREM-02) adds cross-store comparison and
muting price alerts; unmuting stays open, so a mute outlives a lapse and can
still be removed. A free user who asks for one gets ``403`` with
``{"code": "premium_required", "feature": ..., "message": ...}`` (see
``premium_required``), which the app turns into an upgrade prompt.

The entitlement is stored on the user row and written only from RevenueCat
(``app/services/premium_service.py``: its webhook and REST API), never from
the app (decision D1).
"""

from collections.abc import Awaitable, Callable
from datetime import UTC
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core import clock
from app.core.security import get_current_user
from app.models.database import User

PREMIUM_REQUIRED = "premium_required"

# Feature ids sent in a premium_required error, for the app's upgrade prompt.
FEATURE_TREND_12_MONTHS = "trend_12_months"
FEATURE_BUDGET_ROLLOVER = "budget_rollover"
FEATURE_CUSTOM_CATEGORIES = "custom_categories"
FEATURE_DATA_EXPORT = "data_export"
FEATURE_UNLIMITED_RECEIPTS = "unlimited_receipts"
FEATURE_PRICE_COMPARISON = "price_comparison"
FEATURE_PRICE_ALERT_MUTE = "price_alert_mute"

# The free tier's monthly receipt cap. Not premium_required: the scan is not a
# Premium feature, the month's allowance is spent. The app still answers it
# with the upgrade prompt, because Premium lifts the cap.
RECEIPT_QUOTA_EXCEEDED = "receipt_quota_exceeded"


def is_premium(user: User) -> bool:
    """Whether ``user`` has an active Premium entitlement right now.

    Active and before its expiry (no expiry: a grant that does not lapse). The
    expiry is checked here, so a missed EXPIRATION webhook cannot leave a user
    Premium after the period they paid for.
    """
    if not user.premium_active:
        return False
    expires = user.premium_expires_at
    if expires is None:
        return True
    if expires.tzinfo is None:  # SQLite returns naive datetimes
        expires = expires.replace(tzinfo=UTC)
    return clock.now() < expires


async def user_is_premium(user: Annotated[User, Depends(get_current_user)]) -> bool:
    """Dependency form of ``is_premium`` for the signed-in user."""
    return is_premium(user)


def premium_required(feature: str) -> HTTPException:
    """The ``403 premium_required`` error for a free user asking for ``feature``."""
    return HTTPException(
        status_code=403,
        detail={
            "code": PREMIUM_REQUIRED,
            "feature": feature,
            "message": "This feature is part of Grocery Genie Premium.",
        },
    )


def require_premium(feature: str) -> Callable[..., Awaitable[User]]:
    """A dependency for a route that is Premium as a whole.

    ``user: User = Depends(require_premium(FEATURE_...))`` returns the signed-in
    user, or raises ``403 premium_required`` naming ``feature`` for a free one.
    """

    async def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if not is_premium(user):
            raise premium_required(feature)
        return user

    return dependency


def receipt_quota_exceeded(limit: int) -> JSONResponse:
    """The ``429`` for a free user's scan past the monthly cap.

    ``detail`` keeps the string the MVP app already matches on ("quota"), so
    builds in the field keep treating it as the cap, not as a retryable rate
    limit; ``code`` and ``feature`` are what newer builds read.
    """
    return JSONResponse(
        status_code=429,
        content={
            "detail": (
                f"Monthly receipt quota exceeded ({limit} receipts/month on Free tier)."
            ),
            "code": RECEIPT_QUOTA_EXCEEDED,
            "feature": FEATURE_UNLIMITED_RECEIPTS,
            "limit": limit,
        },
    )
