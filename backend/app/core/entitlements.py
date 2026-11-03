"""Premium entitlement: the one place the backend asks "is this user Premium?".

Premium (decision D2, 2026-11-03) gates only the V1.1 extras: the 12-month
spending trend, custom categories, data export, budget rollover and unlimited
receipts. A free user who asks for one gets ``403`` with
``{"code": "premium_required", "feature": ..., "message": ...}`` (see
``premium_required``), which the app turns into an upgrade prompt.

TODO(V11-P0): the Premium tier does not exist yet, so ``is_premium`` returns
False for everyone. V11-P0 (RevenueCat) replaces its body with the stored
entitlement; every gate already goes through it, so nothing else changes.
"""

from typing import Annotated

from fastapi import Depends, HTTPException

from app.core.security import get_current_user
from app.models.database import User

PREMIUM_REQUIRED = "premium_required"

# Feature ids sent in a premium_required error, for the app's upgrade prompt.
FEATURE_TREND_12_MONTHS = "trend_12_months"


def is_premium(user: User) -> bool:
    """Whether ``user`` has an active Premium entitlement.

    TODO(V11-P0): wire to the RevenueCat entitlement. False for everyone until
    then.
    """
    return False


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
