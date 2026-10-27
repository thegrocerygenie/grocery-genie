from __future__ import annotations

import contextlib
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.security import bearer_scheme, get_current_user
from app.image.storage import LocalFileStorage
from app.models.database import User
from app.models.schemas import (
    DeleteAccountRequest,
    EmailChangeConfirmPayload,
    EmailChangeRequestPayload,
    PushTokenPayload,
    UserPreferencesPublic,
    UserPreferencesUpdate,
    UserProfileResponse,
)
from app.services import account_service
from app.services import auth as auth_service
from app.services.push_token_service import PushTokenService

router = APIRouter(prefix="/api/users", tags=["users"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _raise_auth(e: auth_service.AuthError) -> NoReturn:
    raise HTTPException(
        status_code=e.status, detail={"code": e.code, "message": str(e)}
    )


def _to_profile(user: User, *, needs_onboarding: bool = False) -> UserProfileResponse:
    prefs = dict(user.preferences or {})
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        currency_preference=user.currency_preference,
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
        ),
        needs_onboarding=needs_onboarding,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_profile(user, needs_onboarding=needs)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    body: UserPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    if body.locale is not None:
        user.locale = body.locale
    if body.currency_preference is not None:
        user.currency_preference = body.currency_preference

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

    await db.flush()
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_profile(user, needs_onboarding=needs)


@router.post("/me/onboarding-complete", response_model=UserProfileResponse)
async def complete_onboarding(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    await auth_service.complete_onboarding(db, user)
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_profile(user, needs_onboarding=needs)


@router.post("/me/email-change/request", status_code=202)
async def request_email_change(
    body: EmailChangeRequestPayload,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        user = await auth_service.confirm_email_change(db, token=body.token)
    except auth_service.AuthError as e:
        _raise_auth(e)
    return {"email": user.email}


@router.post("/me/push-tokens", status_code=204)
async def register_push_token(
    body: PushTokenPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await PushTokenService(db).register(user.id, body.token)


@router.delete("/me/push-tokens", status_code=204)
async def unregister_push_token(
    body: PushTokenPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await PushTokenService(db).unregister(user.id, body.token)


@router.delete("/me", status_code=204)
async def delete_me(
    body: DeleteAccountRequest | None = None,
    db: AsyncSession = Depends(get_db),
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
