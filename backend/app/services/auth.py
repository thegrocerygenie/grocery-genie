"""Auth service — orchestrates sign-up, sign-in, verify, reset, social.

Routes are thin and stateless; this module owns the business rules
(password policy, lockout, refresh-family invalidation, account linking).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_token,
    decode_token,
    generate_email_token,
    hash_email_token,
    hash_password,
    token_predates_password_change,
    verify_password,
)
from app.core.token_denylist import (
    acquire_refresh_lock_async,
    add_jti_async,
    invalidate_family_async,
    is_family_active_async,
    is_jti_denylisted_async,
)
from app.models.database import Budget, User
from app.services import auth_audit
from app.services.email import (
    send_email_change_email,
    send_reset_password_email,
    send_verify_email,
)

log = logging.getLogger(__name__)

# A real bcrypt hash of an arbitrary string. Used to mask sign-in timing when
# the email is unknown so attackers can't enumerate users by response time.
_DUMMY_BCRYPT_HASH = "$2b$12$IxJW/dRq/7dQzXpXkD3Hje5TCGR.cBCB6VW6wSTEx2rA5OjlvmKMm"


def _aware(dt: datetime | None) -> datetime | None:
    """Coerce a naive (SQLite-loaded) datetime to UTC-aware for comparison."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


# ── Errors ────────────────────────────────────────────────────────


class AuthError(Exception):
    """Base for sign-in/up failures the API translates to HTTP responses."""

    code: str = "auth_error"
    status: int = 400


class EmailAlreadyExistsError(AuthError):
    code = "email_exists"
    status = 409


class InvalidCredentialsError(AuthError):
    code = "invalid_credentials"
    status = 401


class AccountLockedError(AuthError):
    code = "locked"
    status = 423


class InvalidTokenError(AuthError):
    code = "invalid_token"
    status = 400


class WeakPasswordError(AuthError):
    code = "weak_password"
    status = 422


# ── Token helpers ─────────────────────────────────────────────────


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    family_id: str


def issue_tokens(user_id: uuid.UUID, family_id: str | None = None) -> TokenPair:
    """Mint access+refresh pair sharing a family id."""
    fam = family_id or str(uuid.uuid4())
    access, _ = create_token(user_id=user_id, typ="access", family_id=fam)
    refresh, _ = create_token(user_id=user_id, typ="refresh", family_id=fam)
    return TokenPair(access_token=access, refresh_token=refresh, family_id=fam)


# ── Sign up ───────────────────────────────────────────────────────


async def sign_up(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    name: str | None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[User, TokenPair]:
    settings = get_settings()
    email = _normalize_email(email)

    if len(password) < settings.password_min_length:
        raise WeakPasswordError(
            f"password must be at least {settings.password_min_length} characters"
        )
    if len(password.encode("utf-8")) > settings.password_max_length:
        raise WeakPasswordError(
            f"password must be at most {settings.password_max_length} characters"
        )
    if not _has_required_classes(password):
        raise WeakPasswordError(
            "password must include letters and at least one number or symbol"
        )

    existing = await _find_user_by_email(db, email)
    if existing is not None:
        raise EmailAlreadyExistsError("email already registered")

    pwd = hash_password(password)
    raw_token = generate_email_token()
    user = User(
        email=email,
        name=name or email.split("@")[0],
        password_hash=pwd,
        password_updated_at=datetime.now(tz=UTC),
        email_verification_token_hash=hash_email_token(raw_token),
        email_verification_expires_at=datetime.now(tz=UTC) + timedelta(hours=24),
    )
    db.add(user)
    await db.flush()

    await auth_audit.record(
        db,
        event_type=auth_audit.EVENT_SIGNUP,
        user_id=user.id,
        ip=ip,
        user_agent=user_agent,
        metadata={"email": email},
    )

    pair = issue_tokens(user.id)
    await send_verify_email(to=email, token=raw_token)
    return user, pair


# ── Sign in ───────────────────────────────────────────────────────


async def sign_in(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[User, TokenPair]:
    settings = get_settings()
    email = _normalize_email(email)
    user = await _find_user_by_email(db, email)
    now = datetime.now(tz=UTC)

    if user is None:
        # Constant-time-ish: still hash a dummy password to mask timing.
        verify_password(password, _DUMMY_BCRYPT_HASH)
        await auth_audit.record(
            db,
            event_type=auth_audit.EVENT_SIGNIN_FAILURE,
            user_id=None,
            ip=ip,
            user_agent=user_agent,
            metadata={"reason": "no_user", "email": email},
        )
        raise InvalidCredentialsError("invalid credentials")

    locked_until_aware = _aware(user.locked_until)
    if locked_until_aware and locked_until_aware > now:
        await auth_audit.record(
            db,
            event_type=auth_audit.EVENT_LOCKOUT,
            user_id=user.id,
            ip=ip,
            user_agent=user_agent,
            metadata={
                "locked_until": locked_until_aware.isoformat()
                if locked_until_aware
                else None
            },
        )
        raise AccountLockedError("account locked")

    if not verify_password(password, user.password_hash):
        # Sliding window: only count failures within
        # signin_lockout_window_seconds of each other. A failure after the
        # window has elapsed restarts the count rather than accumulating
        # forever (which would eventually lock out a legitimate user).
        last_failed = _aware(user.last_failed_signin_at)
        within_window = (
            last_failed is not None
            and (now - last_failed).total_seconds()
            <= settings.signin_lockout_window_seconds
        )
        user.failed_signin_count = (
            (user.failed_signin_count or 0) + 1 if within_window else 1
        )
        user.last_failed_signin_at = now
        if user.failed_signin_count >= settings.signin_lockout_threshold:
            user.locked_until = now + timedelta(
                seconds=settings.signin_lockout_duration_seconds
            )
            user.failed_signin_count = 0
        await auth_audit.record(
            db,
            event_type=auth_audit.EVENT_SIGNIN_FAILURE,
            user_id=user.id,
            ip=ip,
            user_agent=user_agent,
            metadata={"reason": "bad_password"},
        )
        raise InvalidCredentialsError("invalid credentials")

    user.failed_signin_count = 0
    user.last_failed_signin_at = None
    user.locked_until = None
    pair = issue_tokens(user.id)
    await auth_audit.record(
        db,
        event_type=auth_audit.EVENT_SIGNIN_SUCCESS,
        user_id=user.id,
        ip=ip,
        user_agent=user_agent,
    )
    return user, pair


# ── Refresh ───────────────────────────────────────────────────────


async def refresh(
    db: AsyncSession,
    *,
    refresh_token: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenPair:
    payload = decode_token(refresh_token, expected_typ="refresh")

    if not await is_family_active_async(payload.fam):
        raise InvalidTokenError("session revoked")

    if await is_jti_denylisted_async(payload.jti):
        # Replay of a rotated refresh: this is the smoking gun for token theft.
        await invalidate_family_async(
            payload.fam, ttl_seconds=payload.exp - int(payload.iat)
        )
        await auth_audit.record(
            db,
            event_type=auth_audit.EVENT_TOKEN_REUSE_DETECTED,
            user_id=_uuid(payload.sub),
            ip=ip,
            user_agent=user_agent,
            metadata={"family": payload.fam},
        )
        raise InvalidTokenError("token reuse detected")

    if not await acquire_refresh_lock_async(payload.jti):
        # Another caller is mid-rotation; ask the client to retry.
        raise InvalidTokenError("refresh in progress")

    user = await db.get(User, _uuid(payload.sub))
    if user is None:
        raise InvalidTokenError("user not found")

    # A password reset/change invalidates every session issued before it.
    if token_predates_password_change(int(payload.iat), user):
        raise InvalidTokenError("session expired")

    # Denylist the old refresh JTI for the remainder of its lifetime.
    remaining = max(0, payload.exp - int(datetime.now(tz=UTC).timestamp()))
    await add_jti_async(payload.jti, remaining)

    pair = issue_tokens(user.id, family_id=payload.fam)
    return pair


# ── Sign out ──────────────────────────────────────────────────────


async def sign_out(
    db: AsyncSession,
    *,
    access_token: str,
    user: User,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    payload = decode_token(access_token, expected_typ="access")
    remaining = max(0, payload.exp - int(datetime.now(tz=UTC).timestamp()))
    settings = get_settings()
    await add_jti_async(payload.jti, remaining)
    # Wipe the whole family so the paired refresh dies too.
    await invalidate_family_async(
        payload.fam, ttl_seconds=settings.jwt_refresh_ttl_seconds
    )
    await auth_audit.record(
        db,
        event_type=auth_audit.EVENT_SIGNOUT,
        user_id=user.id,
        ip=ip,
        user_agent=user_agent,
    )


# ── Email verification ────────────────────────────────────────────


async def verify_email(db: AsyncSession, *, token: str) -> User:
    token_hash = hash_email_token(token)
    user = await _find_user_by_verification_token(db, token_hash)
    if user is None:
        raise InvalidTokenError("invalid or expired verification token")
    now = datetime.now(tz=UTC)
    if (
        _aware(user.email_verification_expires_at)
        and _aware(user.email_verification_expires_at) < now
    ):
        raise InvalidTokenError("verification token expired")
    user.email_verified_at = now
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None
    await auth_audit.record(
        db, event_type=auth_audit.EVENT_EMAIL_VERIFY, user_id=user.id
    )
    return user


async def resend_verification(db: AsyncSession, *, email: str) -> None:
    email = _normalize_email(email)
    user = await _find_user_by_email(db, email)
    if user is None:
        return
    if user.email_verified_at:
        return
    raw_token = generate_email_token()
    user.email_verification_token_hash = hash_email_token(raw_token)
    user.email_verification_expires_at = datetime.now(tz=UTC) + timedelta(hours=24)
    await auth_audit.record(
        db, event_type=auth_audit.EVENT_EMAIL_VERIFY_RESEND, user_id=user.id
    )
    await send_verify_email(to=email, token=raw_token)


# ── Forgot / reset password ──────────────────────────────────────


async def forgot_password(db: AsyncSession, *, email: str) -> None:
    email = _normalize_email(email)
    user = await _find_user_by_email(db, email)
    if user is None:
        return
    raw_token = generate_email_token()
    user.password_reset_token_hash = hash_email_token(raw_token)
    user.password_reset_expires_at = datetime.now(tz=UTC) + timedelta(hours=1)
    await auth_audit.record(
        db, event_type=auth_audit.EVENT_PASSWORD_RESET_REQUEST, user_id=user.id
    )
    await send_reset_password_email(to=email, token=raw_token)


async def reset_password(db: AsyncSession, *, token: str, new_password: str) -> User:
    settings = get_settings()
    if len(new_password) < settings.password_min_length:
        raise WeakPasswordError("password too short")
    if len(new_password.encode("utf-8")) > settings.password_max_length:
        raise WeakPasswordError("password too long")
    if not _has_required_classes(new_password):
        raise WeakPasswordError("password must include letters and a number/symbol")

    token_hash = hash_email_token(token)
    user = await _find_user_by_reset_token(db, token_hash)
    if user is None:
        raise InvalidTokenError("invalid or expired reset token")
    now = datetime.now(tz=UTC)
    if (
        _aware(user.password_reset_expires_at)
        and _aware(user.password_reset_expires_at) < now
    ):
        raise InvalidTokenError("reset token expired")

    user.password_hash = hash_password(new_password)
    user.password_updated_at = now
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    user.failed_signin_count = 0
    user.locked_until = None

    # Invalidate every active token family for this user so all sessions die.
    # We don't have the exact family ids cached; the safe move is a long-lived
    # marker keyed on user_id that get_current_user can also check. For MVP we
    # rely on access tokens being short-lived (1h) — refresh attempts will
    # fail because the refresh family check goes through the same flow.
    await auth_audit.record(
        db, event_type=auth_audit.EVENT_PASSWORD_RESET_COMPLETE, user_id=user.id
    )
    return user


# ── Email change ─────────────────────────────────────────────────


async def request_email_change(
    db: AsyncSession,
    *,
    user: User,
    new_email: str,
    current_password: str,
) -> None:
    new_email = _normalize_email(new_email)
    if not verify_password(current_password, user.password_hash):
        raise InvalidCredentialsError("password incorrect")
    if await _find_user_by_email(db, new_email) is not None:
        raise EmailAlreadyExistsError("email already in use")
    raw_token = generate_email_token()
    user.pending_email = new_email
    user.pending_email_token_hash = hash_email_token(raw_token)
    user.pending_email_expires_at = datetime.now(tz=UTC) + timedelta(hours=1)
    await auth_audit.record(
        db,
        event_type=auth_audit.EVENT_EMAIL_CHANGE_REQUEST,
        user_id=user.id,
        metadata={"new_email": new_email},
    )
    # Send confirmation to the *current* email — that's the security control.
    await send_email_change_email(to=user.email, new_email=new_email, token=raw_token)


async def confirm_email_change(db: AsyncSession, *, token: str) -> User:
    token_hash = hash_email_token(token)
    user = await _find_user_by_email_change_token(db, token_hash)
    if user is None:
        raise InvalidTokenError("invalid or expired email-change token")
    now = datetime.now(tz=UTC)
    if (
        _aware(user.pending_email_expires_at)
        and _aware(user.pending_email_expires_at) < now
    ):
        raise InvalidTokenError("email-change token expired")
    if not user.pending_email:
        raise InvalidTokenError("no pending email change")

    user.email = user.pending_email
    user.pending_email = None
    user.pending_email_token_hash = None
    user.pending_email_expires_at = None
    user.email_verified_at = now  # Confirmed via the new email.

    await auth_audit.record(
        db, event_type=auth_audit.EVENT_EMAIL_CHANGE_COMPLETE, user_id=user.id
    )
    return user


# ── Social sign in (Apple/Google) ─────────────────────────────────


async def upsert_apple_user(
    db: AsyncSession,
    *,
    sub: str,
    email: str | None,
    email_verified: bool,
) -> User:
    return await _upsert_social_user(
        db,
        provider_field="apple_subject",
        provider_value=sub,
        email=email,
        email_verified=email_verified,
    )


async def upsert_google_user(
    db: AsyncSession,
    *,
    sub: str,
    email: str,
    email_verified: bool,
    name: str | None,
) -> User:
    return await _upsert_social_user(
        db,
        provider_field="google_subject",
        provider_value=sub,
        email=email,
        email_verified=email_verified,
        name=name,
    )


async def _upsert_social_user(
    db: AsyncSession,
    *,
    provider_field: str,
    provider_value: str,
    email: str | None,
    email_verified: bool,
    name: str | None = None,
) -> User:
    # First match by provider subject.
    column = getattr(User, provider_field)
    result = await db.execute(select(User).where(column == provider_value))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    # Then attempt to link to an existing email-verified account.
    if email and email_verified:
        existing = await _find_user_by_email(db, _normalize_email(email))
        if existing is not None and existing.email_verified_at is not None:
            setattr(existing, provider_field, provider_value)
            await auth_audit.record(
                db,
                event_type=auth_audit.EVENT_SOCIAL_LINK,
                user_id=existing.id,
                metadata={"provider": provider_field},
            )
            return existing

    # Create a brand new account.
    if not email:
        raise InvalidTokenError("social provider returned no email")
    new_user = User(
        email=_normalize_email(email),
        name=name or (email.split("@")[0] if email else "User"),
        email_verified_at=datetime.now(tz=UTC) if email_verified else None,
    )
    setattr(new_user, provider_field, provider_value)
    db.add(new_user)
    await db.flush()
    await auth_audit.record(
        db,
        event_type=auth_audit.EVENT_SOCIAL_LINK,
        user_id=new_user.id,
        metadata={"provider": provider_field, "new_user": True},
    )
    return new_user


# ── Onboarding state ──────────────────────────────────────────────


async def user_needs_onboarding(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """True iff the user has no active monthly budget yet.

    Used by sign-up / sign-in routes to tell the mobile client whether
    to send the user through the budget + camera onboarding screens.
    Covers fresh sign-ups, brand-new social accounts, and accounts that
    were linked or that abandoned onboarding mid-flow.
    """
    result = await db.execute(
        select(Budget.id)
        .where(Budget.user_id == user_id)
        .where(Budget.period_type == "monthly")
        .where(Budget.deleted_at.is_(None))
        .limit(1)
    )
    return result.scalar_one_or_none() is None


# ── Internal lookups ─────────────────────────────────────────────


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as e:
        raise InvalidTokenError("invalid subject") from e


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _has_required_classes(password: str) -> bool:
    has_alpha = any(c.isalpha() for c in password)
    has_other = any(not c.isalpha() for c in password)
    return has_alpha and has_other


async def _find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def _find_user_by_verification_token(
    db: AsyncSession, token_hash: str
) -> User | None:
    result = await db.execute(
        select(User).where(User.email_verification_token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def _find_user_by_reset_token(db: AsyncSession, token_hash: str) -> User | None:
    result = await db.execute(
        select(User).where(User.password_reset_token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def _find_user_by_email_change_token(
    db: AsyncSession, token_hash: str
) -> User | None:
    result = await db.execute(
        select(User).where(User.pending_email_token_hash == token_hash)
    )
    return result.scalar_one_or_none()
