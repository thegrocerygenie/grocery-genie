"""The waitlist's free year of Premium: status and "Claim your waitlist offer"
(V11-P5). Matching itself runs inside sign-in, verify-email and email change;
these routes serve the Settings claim step, for an account whose email is not
the one it joined the waitlist with (Apple's Hide My Email)."""

from __future__ import annotations

import hashlib
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import get_settings
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
from app.services.waitlist_service import GRANTED, WaitlistError, WaitlistService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users/me/waitlist-offer", tags=["waitlist"])

# Enqueues the claim for the worker: (user id, normalized waitlist email).
ClaimDispatcher = Callable[[uuid.UUID, str], Awaitable[None]]


async def _enqueue_claim(user_id: uuid.UUID, email: str) -> None:
    from app.tasks.waitlist_tasks import send_waitlist_claim_task

    # Celery's publish is blocking I/O: keep it off the event loop.
    await run_in_threadpool(send_waitlist_claim_task.delay, str(user_id), email)


def get_claim_dispatcher() -> ClaimDispatcher:
    """The Celery task by default; tests replace it."""
    return _enqueue_claim


def _raise(e: WaitlistError) -> NoReturn:
    raise HTTPException(
        status_code=e.status, detail={"code": e.code, "message": str(e)}
    ) from e


def _public(redemption: WaitlistRedemption | None) -> WaitlistRedemptionPublic | None:
    if redemption is None:
        return None
    return WaitlistRedemptionPublic(
        # A failed grant needs an operator (docs/DEPLOYMENT.md 2.10); to the
        # app it is still being set up.
        status="granted" if redemption.status == GRANTED else "pending",
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
    dispatch: ClaimDispatcher = Depends(get_claim_dispatcher),
) -> dict:
    """Send a confirmation link to the waitlist email. The route checks only
    the account's own state, then enqueues one task for any email: the worker
    looks the email up and sends the link. So the answer, its timing and its
    errors are the same whether or not that email is on the waitlist."""
    try:
        email = await WaitlistService(db, analytics).check_claim(user, body.email)
    except WaitlistError as e:
        _raise(e)
    digest = hashlib.sha256(email.encode()).hexdigest()
    if await rate_limit.allow(
        f"waitlist-claim-email:{digest}",
        window=86400.0,
        limit=get_settings().max_waitlist_claims_per_email_per_day,
    ):
        await dispatch(user.id, email)
    else:
        # The same answer: the limit must not show anything either.
        logger.info("waitlist claim over the per-email daily limit; not sent")
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
