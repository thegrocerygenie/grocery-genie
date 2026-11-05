from __future__ import annotations

import contextlib
from datetime import date
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import Receive, Scope, Send

from app.core import rate_limit
from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.entitlements import FEATURE_DATA_EXPORT, is_premium, require_premium
from app.core.security import bearer_scheme, get_current_user
from app.image.storage import LocalFileStorage
from app.models.database import User
from app.models.export import ExportSummary
from app.models.schemas import (
    AiConsentGrantRequest,
    DeleteAccountRequest,
    EmailChangeConfirmPayload,
    EmailChangeRequestPayload,
    PushTokenPayload,
    UserPreferencesPublic,
    UserPreferencesUpdate,
    UserProfileResponse,
)
from app.services import account_service, ai_consent
from app.services import auth as auth_service
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.budget_service import BudgetService
from app.services.export_service import (
    ExportBusyError,
    ExportCancelledError,
    ExportFile,
    ExportFormat,
    ExportOptions,
    ExportService,
    export_slot,
    parse_includes,
)
from app.services.premium_service import PremiumService
from app.services.push_token_service import PushTokenService
from app.services.revenuecat_client import (
    RevenueCatClient,
    RevenueCatUnavailableError,
    get_revenuecat_client,
)
from app.services.waitlist_service import SOURCE_EMAIL_CHANGE, WaitlistService

router = APIRouter(prefix="/api/users", tags=["users"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _raise_auth(e: auth_service.AuthError) -> NoReturn:
    raise HTTPException(
        status_code=e.status, detail={"code": e.code, "message": str(e)}
    )


def user_profile(user: User, *, needs_onboarding: bool = False) -> UserProfileResponse:
    prefs = dict(user.preferences or {})
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        currency_preference=user.currency_preference,
        timezone=user.timezone,
        email_verified_at=user.email_verified_at,
        preferences=UserPreferencesPublic(
            notification_thresholds={
                "fifty": user.notif_threshold_50,
                "eighty": user.notif_threshold_80,
                "hundred": user.notif_threshold_100,
            },
            weekly_summary={
                "enabled": user.weekly_summary_enabled,
                "day": user.weekly_summary_day,
            },
            ocr_languages=prefs.get("ocr_languages", []),
            muted_alert_categories=prefs.get("muted_alert_categories", []),
        ),
        needs_onboarding=needs_onboarding,
        ai_consent=ai_consent.public(user),
        is_premium=is_premium(user),
        premium_expires_at=user.premium_expires_at if user.premium_active else None,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> UserProfileResponse:
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return user_profile(user, needs_onboarding=needs)


@router.post("/me/premium/refresh", response_model=UserProfileResponse)
async def refresh_premium(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
    analytics: AnalyticsService = Depends(get_analytics_service),
    revenuecat: RevenueCatClient | None = Depends(get_revenuecat_client),
) -> UserProfileResponse:
    """Read the user's Premium entitlement from RevenueCat's REST API.

    The app calls this after a purchase or a restore, so Premium shows without
    waiting for the webhook. The server asks RevenueCat; nothing the app sends
    is trusted.
    """
    try:
        user = await PremiumService(db, analytics, revenuecat).refresh(user)
    except RevenueCatUnavailableError:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "revenuecat_unavailable",
                "message": "Could not check your subscription. Try again soon.",
            },
        ) from None
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return user_profile(user, needs_onboarding=needs)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    body: UserPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> UserProfileResponse:
    if body.locale is not None:
        user.locale = body.locale
    if (
        body.currency_preference is not None
        and body.currency_preference != user.currency_preference
    ):
        # Budget amounts are not converted, so no rollover carry crosses a
        # currency change (EC Budget 4).
        await BudgetService(db).restart_rollovers(user.id)
        user.currency_preference = body.currency_preference
    if body.timezone is not None:
        user.timezone = body.timezone

    if body.notification_thresholds is not None:
        if body.notification_thresholds.fifty is not None:
            user.notif_threshold_50 = body.notification_thresholds.fifty
        if body.notification_thresholds.eighty is not None:
            user.notif_threshold_80 = body.notification_thresholds.eighty
        if body.notification_thresholds.hundred is not None:
            user.notif_threshold_100 = body.notification_thresholds.hundred

    if body.weekly_summary is not None:
        if body.weekly_summary.enabled is not None:
            user.weekly_summary_enabled = body.weekly_summary.enabled
        if body.weekly_summary.day is not None:
            user.weekly_summary_day = body.weekly_summary.day

    if body.ocr_languages is not None:
        prefs = dict(user.preferences or {})
        # Arrays replace, never deep-merge — multi-select semantics.
        prefs["ocr_languages"] = list(body.ocr_languages)
        user.preferences = prefs

    if body.muted_alert_categories is not None:
        prefs = dict(user.preferences or {})
        # Replaced whole, duplicates dropped, order kept.
        muted = dict.fromkeys(str(c) for c in body.muted_alert_categories)
        prefs["muted_alert_categories"] = list(muted)
        user.preferences = prefs

    await db.flush()
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return user_profile(user, needs_onboarding=needs)


@router.post("/me/onboarding-complete", response_model=UserProfileResponse)
async def complete_onboarding(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> UserProfileResponse:
    await auth_service.complete_onboarding(db, user)
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return user_profile(user, needs_onboarding=needs)


@router.put("/me/ai-consent", response_model=UserProfileResponse)
async def grant_ai_consent(
    body: AiConsentGrantRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> UserProfileResponse:
    """Allow receipts to go to third-party AI for the policy version shown."""
    try:
        ai_consent.grant(user, body.policy_version)
    except ai_consent.ConsentVersionMismatchError:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ai_consent_version_mismatch",
                "message": "The consent text changed. Review it again.",
                "current_policy_version": ai_consent.AI_CONSENT_POLICY_VERSION,
            },
        ) from None
    await db.flush()
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return user_profile(user, needs_onboarding=needs)


@router.delete("/me/ai-consent", response_model=UserProfileResponse)
async def withdraw_ai_consent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> UserProfileResponse:
    """Withdraw consent: scans are refused until the user allows them again."""
    ai_consent.withdraw(user)
    await db.flush()
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return user_profile(user, needs_onboarding=needs)


@router.post("/me/email-change/request", status_code=202)
async def request_email_change(
    body: EmailChangeRequestPayload,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> dict:
    try:
        await auth_service.request_email_change(
            db,
            user=user,
            new_email=body.new_email,
            current_password=body.current_password,
        )
    except auth_service.AuthError as e:
        _raise_auth(e)
    return {"status": "sent"}


@router.post("/me/email-change/confirm", status_code=200)
async def confirm_email_change(
    body: EmailChangeConfirmPayload,
    db: AsyncSession = Depends(get_db, scope="function"),
    analytics: AnalyticsService = Depends(get_analytics_service),
    revenuecat: RevenueCatClient | None = Depends(get_revenuecat_client),
) -> dict:
    try:
        user = await auth_service.confirm_email_change(db, token=body.token)
    except auth_service.AuthError as e:
        _raise_auth(e)
    email = user.email
    # The waitlist's free year (V11-P5): the new email is verified now.
    await WaitlistService(db, analytics, revenuecat).match_account(
        user, source=SOURCE_EMAIL_CHANGE
    )
    return {"email": email}


@router.post("/me/push-tokens", status_code=204)
async def register_push_token(
    body: PushTokenPayload,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> None:
    await PushTokenService(db).register(user.id, body.token)


@router.delete("/me/push-tokens", status_code=204)
async def unregister_push_token(
    body: PushTokenPayload,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> None:
    await PushTokenService(db).unregister(user.id, body.token)


@router.delete("/me", status_code=204)
async def delete_me(
    body: DeleteAccountRequest | None = None,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    """Delete the account and everything it owns (App Store 5.1.1(v)).

    A Sign in with Apple account sends a fresh authorization code, and its
    Apple grant is revoked first; if that fails, nothing is deleted. The
    account's other sessions fail from here on: their user is gone.
    """
    try:
        await account_service.revoke_sign_in_grants(
            user,
            apple_authorization_code=body.apple_authorization_code if body else None,
        )
    except account_service.AccountDeletionError as e:
        raise HTTPException(
            status_code=e.status, detail={"code": e.code, "message": str(e)}
        ) from e
    storage = LocalFileStorage(get_settings().storage_path)
    await account_service.delete_account(db, user.id, storage=storage)
    if credentials is not None:
        # The DEBUG-only legacy api_token is not a JWT; nothing to revoke.
        with contextlib.suppress(HTTPException):
            await auth_service.revoke_session(credentials.credentials)


def _check_range(start: date | None, end: date | None) -> None:
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_range", "message": "from is after to"},
        )


_FROM = Query(
    default=None,
    alias="from",
    description="First day in the range (YYYY-MM-DD). Left out: no lower bound.",
)
_TO = Query(
    default=None,
    alias="to",
    description="Last day in the range (YYYY-MM-DD). Left out: no upper bound.",
)


@router.get("/me/export/summary", response_model=ExportSummary)
async def export_summary(
    start: date | None = _FROM,
    end: date | None = _TO,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_DATA_EXPORT)),
) -> ExportSummary:
    """How many receipts an export of the range holds (PREM-04 AC 4)."""
    _check_range(start, end)
    options = ExportOptions(start=start, end=end)
    return ExportSummary(
        receipt_count=await ExportService(db).count_receipts(user.id, options)
    )


@router.get("/me/export")
async def export_data(
    request: Request,
    fmt: ExportFormat = Query(
        default=ExportFormat.JSON,
        alias="format",
        description=(
            "json: one document. csv: a zip of one CSV file per entity. "
            "pdf: a spend report."
        ),
    ),
    start: date | None = _FROM,
    end: date | None = _TO,
    include: str | None = Query(
        default=None,
        description=(
            "Comma-separated sections: receipts, prices, budgets, images. "
            "Left out: receipts,prices,budgets."
        ),
    ),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_DATA_EXPORT)),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> Response:
    """Download receipts, line items, categories, budgets and prices (NFR
    Privacy 2), for a range and chosen sections (PREM-04).

    Premium (D2). The file is built from batched reads into a spooled
    temporary file, then streamed, so a large account stays bounded in memory.
    One export at a time per user and ``max_exports_per_hour`` an hour, else
    429; a build whose client has gone stops at its next page.
    """
    _check_range(start, end)
    try:
        includes = parse_includes(include)
    except ValueError as e:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_include", "message": str(e)}
        ) from e
    options = ExportOptions(fmt=fmt, start=start, end=end, includes=includes)
    settings = get_settings()
    storage = LocalFileStorage(settings.storage_path)
    try:
        async with export_slot(db, user.id):
            # Counted once the slot is ours: a refused request costs nothing.
            if not await rate_limit.allow(
                f"export:{user.id}",
                window=3600.0,
                limit=settings.max_exports_per_hour,
            ):
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "export_rate_limited",
                        "message": "Too many exports this hour. Try again later.",
                    },
                    headers={"Retry-After": "600"},
                )
            export = await ExportService(db, storage=storage).build(
                user, options, should_stop=request.is_disconnected
            )
    except ExportBusyError:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "export_in_progress",
                "message": "An export is already being prepared. Try again soon.",
            },
            headers={"Retry-After": "30"},
        ) from None
    except ExportCancelledError:
        # Nobody is listening; the spooled file is already closed.
        return Response(status_code=499)
    try:
        analytics.emit(
            "data_exported",
            {
                "format": fmt.value,
                "from": start.isoformat() if start else None,
                "to": end.isoformat() if end else None,
                "includes": options.include_names,
                **export.counts.model_dump(),
            },
            user.id,
        )
    except BaseException:
        export.close()
        raise
    return _export_response(export)


class _ExportResponse(StreamingResponse):
    """Streams an export and closes its spooled file however the response
    ends: fully sent, the client gone before the first byte, or an error."""

    def __init__(self, export: ExportFile) -> None:
        self._export = export
        super().__init__(
            export.chunks(),
            media_type=export.media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{export.filename}"',
                "Content-Length": str(export.size),
                "Cache-Control": "no-store",
            },
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self._export.close()


def _export_response(export: ExportFile) -> StreamingResponse:
    return _ExportResponse(export)
