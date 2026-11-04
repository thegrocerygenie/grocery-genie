"""The waitlist's free year of Premium: status and "Claim your waitlist offer"
(V11-P5). Matching itself runs inside sign-in, verify-email and email change;
these routes serve the Settings claim step, for an account whose email is not
the one it joined the waitlist with (Apple's Hide My Email)."""

from __future__ import annotations

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import User, WaitlistRedemption
from app.models.schemas import (
    WaitlistClaimConfirmRequest,
    WaitlistClaimRequest,
    WaitlistOfferResponse,
    WaitlistRedemptionPublic,
)
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.revenuecat_client import RevenueCatClient, get_revenuecat_client
from app.services.waitlist_service import WaitlistError, WaitlistService

router = APIRouter(prefix="/api/users/me/waitlist-offer", tags=["waitlist"])


def _raise(e: WaitlistError) -> NoReturn:
    raise HTTPException(
        status_code=e.status, detail={"code": e.code, "message": str(e)}
    ) from e


def _public(redemption: WaitlistRedemption | None) -> WaitlistRedemptionPublic | None:
    if redemption is None:
        return None
    return WaitlistRedemptionPublic(
        status=redemption.status,  # type: ignore[arg-type]
        expires_at=redemption.grant_expires_at,
    )


@router.get("", response_model=WaitlistOfferResponse)
async def get_offer(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WaitlistOfferResponse:
    status = await WaitlistService(db).status(user)
    return WaitlistOfferResponse(
        window_open=status.window_open,
        claim_available=status.claim_available,
        closes_at=status.closes_at,
        redemption=_public(status.redemption),
    )


@router.post("/claim", status_code=202)
async def request_claim(
    body: WaitlistClaimRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    """Send a confirmation link to the waitlist email. The answer is the same
    whether or not that email is on the waitlist."""
    try:
        await WaitlistService(db, analytics).request_claim(user, body.email)
    except WaitlistError as e:
        _raise(e)
    return {"status": "sent"}


@router.post("/confirm", response_model=WaitlistRedemptionPublic)
async def confirm_claim(
    body: WaitlistClaimConfirmRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    analytics: AnalyticsService = Depends(get_analytics_service),
    revenuecat: RevenueCatClient | None = Depends(get_revenuecat_client),
) -> WaitlistRedemptionPublic:
    """The link in the claim email: the token proves the user holds the
    waitlist email, like the email-change confirmation."""
    try:
        _, redemption = await WaitlistService(db, analytics, revenuecat).confirm_claim(
            body.token
        )
    except WaitlistError as e:
        _raise(e)
    public = _public(redemption)
    assert public is not None
    return public
