from __future__ import annotations

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import (
    AppleSignInRequest,
    ForgotPasswordRequest,
    GoogleSignInRequest,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignInRequest,
    SignUpRequest,
    TokenPairResponse,
    UserPreferencesPublic,
    UserProfileResponse,
    VerifyEmailRequest,
)
from app.services import auth as auth_service
from app.services.apple_auth import verify_apple_sign_in
from app.services.google_auth import verify_google_id_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _user_to_profile(
    user: User, *, needs_onboarding: bool = False
) -> UserProfileResponse:
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


def _to_pair(
    pair: auth_service.TokenPair, *, needs_onboarding: bool = False
) -> TokenPairResponse:
    return TokenPairResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        needs_onboarding=needs_onboarding,
    )


def _raise_auth(e: auth_service.AuthError) -> NoReturn:
    raise HTTPException(
        status_code=e.status, detail={"code": e.code, "message": str(e)}
    )


@router.post("/sign-up", response_model=TokenPairResponse, status_code=201)
async def sign_up(
    body: SignUpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    try:
        user, pair = await auth_service.sign_up(
            db,
            email=body.email,
            password=body.password,
            name=body.name,
            ip=_ip(request),
            user_agent=_ua(request),
        )
    except auth_service.AuthError as e:
        _raise_auth(e)
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_pair(pair, needs_onboarding=needs)


@router.post("/sign-in", response_model=TokenPairResponse)
async def sign_in(
    body: SignInRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    try:
        user, pair = await auth_service.sign_in(
            db,
            email=body.email,
            password=body.password,
            ip=_ip(request),
            user_agent=_ua(request),
        )
    except auth_service.AuthError as e:
        _raise_auth(e)
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_pair(pair, needs_onboarding=needs)


@router.post("/sign-out", status_code=204)
async def sign_out(
    request: Request,
    user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> None:
    if credentials is None:
        raise HTTPException(status_code=401, detail="missing credentials")
    await auth_service.sign_out(
        db,
        access_token=credentials.credentials,
        user=user,
        ip=_ip(request),
        user_agent=_ua(request),
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    try:
        pair = await auth_service.refresh(
            db,
            refresh_token=body.refresh_token,
            ip=_ip(request),
            user_agent=_ua(request),
        )
    except auth_service.AuthError as e:
        _raise_auth(e)
    return _to_pair(pair)


@router.post("/verify-email", status_code=200)
async def verify_email(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        user = await auth_service.verify_email(db, token=body.token)
    except auth_service.AuthError as e:
        _raise_auth(e)
    return {"verified_at": user.email_verified_at}


@router.post("/resend-verification", status_code=202)
async def resend_verification(
    body: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await auth_service.resend_verification(db, email=body.email)
    return {"status": "sent"}


@router.post("/forgot-password", status_code=202)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await auth_service.forgot_password(db, email=body.email)
    return {"status": "sent"}


@router.post("/reset-password", status_code=200)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await auth_service.reset_password(
            db, token=body.token, new_password=body.new_password
        )
    except auth_service.AuthError as e:
        _raise_auth(e)
    return {"status": "ok"}


@router.post("/apple", response_model=TokenPairResponse)
async def apple_sign_in(
    body: AppleSignInRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    try:
        identity = await verify_apple_sign_in(
            identity_token=body.identity_token,
            authorization_code=body.authorization_code,
            nonce=body.nonce,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    user = await auth_service.upsert_apple_user(
        db,
        sub=identity.sub,
        email=identity.email,
        email_verified=identity.email_verified,
    )
    pair = auth_service.issue_tokens(user.id)
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_pair(pair, needs_onboarding=needs)


@router.post("/google", response_model=TokenPairResponse)
async def google_sign_in(
    body: GoogleSignInRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    try:
        identity = await verify_google_id_token(body.id_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    user = await auth_service.upsert_google_user(
        db,
        sub=identity.sub,
        email=identity.email,
        email_verified=identity.email_verified,
        name=identity.name,
    )
    pair = auth_service.issue_tokens(user.id)
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _to_pair(pair, needs_onboarding=needs)


@router.get("/me", response_model=UserProfileResponse)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    needs = await auth_service.user_needs_onboarding(db, user.id)
    return _user_to_profile(user, needs_onboarding=needs)
