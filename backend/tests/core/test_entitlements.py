from app.core.entitlements import is_premium
from app.models.database import User
from tests.conftest import DEV_USER_ID


def test_nobody_is_premium_until_the_premium_tier_ships():
    # V11-P0 wires this to the RevenueCat entitlement; until then, D2's
    # Premium-only features stay locked for every account.
    assert is_premium(User(id=DEV_USER_ID, email="a@example.com")) is False
