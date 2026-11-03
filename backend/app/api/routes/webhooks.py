"""Webhooks from third parties. Each authenticates with its own secret, not a
user token."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.models.schemas import RevenueCatWebhookBody, RevenueCatWebhookResponse
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.premium_service import PremiumService
from app.services.revenuecat_client import RevenueCatClient, get_revenuecat_client

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def require_revenuecat_secret(
    authorization: str | None = Header(default=None),
) -> None:
    """RevenueCat sends the Authorization value set on its webhook, as typed.

    It matches the configured secret, alone or after ``Bearer ``. No secret
    configured refuses every delivery.
    """
    secret = get_settings().revenuecat_webhook_secret
    given = (authorization or "").strip()
    if given.startswith("Bearer "):
        given = given[len("Bearer ") :].strip()
    if not secret or not hmac.compare_digest(given.encode(), secret.encode()):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "invalid_webhook_secret",
                "message": "Missing or wrong webhook secret.",
            },
        )


@router.post(
    "/revenuecat",
    response_model=RevenueCatWebhookResponse,
    dependencies=[Depends(require_revenuecat_secret)],
)
async def revenuecat_webhook(
    body: RevenueCatWebhookBody,
    db: AsyncSession = Depends(get_db, scope="function"),
    analytics: AnalyticsService = Depends(get_analytics_service),
    revenuecat: RevenueCatClient | None = Depends(get_revenuecat_client),
) -> RevenueCatWebhookResponse:
    """Apply one RevenueCat event to the user's Premium entitlement.

    Always 200 once authenticated and well formed, also for an event that
    changes nothing (a retry, an unknown user, another entitlement), so
    RevenueCat stops retrying it. ``status`` says what happened.
    """
    status = await PremiumService(db, analytics, revenuecat).handle_webhook(body.event)
    return RevenueCatWebhookResponse(status=status)
