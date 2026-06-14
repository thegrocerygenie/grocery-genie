"""JWT and password-hashing primitives.

This module is intentionally kept thin and free of business logic.
Business orchestration lives in `app.services.auth`.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.token_denylist import (
    is_family_active_async,
    is_jti_denylisted_async,
)
from app.models.database import User

bearer_scheme = HTTPBearer(auto_error=False)

TokenType = Literal["access", "refresh"]


# ── Password hashing ────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Hash with bcrypt directly (passlib has known incompatibilities with
    bcrypt 4+). 72-byte cap matches bcrypt's input limit; we reject longer
    inputs to avoid silent truncation."""
    settings = get_settings()
    encoded = plain.encode("utf-8")
    if len(encoded) > settings.password_max_length:
        raise ValueError("password too long")
    if len(plain) < settings.password_min_length:
        raise ValueError("password too short")
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(encoded, salt).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    encoded = plain.encode("utf-8")
    if len(encoded) > 72:
        return False
    try:
        return bcrypt.checkpw(encoded, hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── Email/reset token hashing ───────────────────────────────────────


def generate_email_token() -> str:
    """256-bit URL-safe token used for verification/reset links."""
    return secrets.token_urlsafe(32)


def hash_email_token(token: str) -> str:
    """SHA-256 hex of the raw token. We store this; we send the raw token in email."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ── JWT ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TokenPayload:
    sub: str  # user id (UUID string)
    jti: str  # token id
    fam: str  # family id
    typ: TokenType
    iat: int
    exp: int
    iss: str
    aud: str


def _settings():
    return get_settings()


def create_token(
    *,
    user_id: uuid.UUID | str,
    typ: TokenType,
    family_id: uuid.UUID | str | None = None,
    ttl_seconds: int | None = None,
) -> tuple[str, TokenPayload]:
    """Issue a JWT. Returns (encoded_token, payload).

    `family_id` ties an access token to its refresh-token family so a single
    sign-out can revoke both. Generates one if not provided.
    """
    settings = _settings()
    now = datetime.now(tz=UTC)
    ttl = ttl_seconds or (
        settings.jwt_access_ttl_seconds
        if typ == "access"
        else settings.jwt_refresh_ttl_seconds
    )
    payload = TokenPayload(
        sub=str(user_id),
        jti=str(uuid.uuid4()),
        fam=str(family_id) if family_id else str(uuid.uuid4()),
        typ=typ,
        iat=int(now.timestamp()),
        exp=int((now + timedelta(seconds=ttl)).timestamp()),
        iss=settings.jwt_issuer,
        aud=settings.jwt_audience,
    )
    token = jwt.encode(
        {
            "sub": payload.sub,
            "jti": payload.jti,
            "fam": payload.fam,
            "typ": payload.typ,
            "iat": payload.iat,
            "exp": payload.exp,
            "iss": payload.iss,
            "aud": payload.aud,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, payload


def token_predates_password_change(iat: int, user: User) -> bool:
    """True if a token issued at ``iat`` predates the user's last password change.

    Lets a password reset/change invalidate every previously issued session
    without tracking individual token families.
    """
    changed = user.password_updated_at
    if changed is None:
        return False
    if changed.tzinfo is None:
        changed = changed.replace(tzinfo=UTC)
    return iat < int(changed.timestamp())


def decode_token(token: str, expected_typ: TokenType | None = None) -> TokenPayload:
    settings = _settings()
    try:
        decoded = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail="token expired") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="invalid token") from e

    if expected_typ and decoded.get("typ") != expected_typ:
        raise HTTPException(status_code=401, detail="wrong token type")

    return TokenPayload(
        sub=decoded["sub"],
        jti=decoded["jti"],
        fam=decoded["fam"],
        typ=decoded["typ"],
        iat=decoded["iat"],
        exp=decoded["exp"],
        iss=decoded["iss"],
        aud=decoded["aud"],
    )


# ── FastAPI dependency: authenticated user ──────────────────────────


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the current user from a Bearer token.

    Accepts JWT access tokens. In DEBUG mode also accepts the legacy static
    `api_token` value seeded for dev users; the fallback is removed once the
    mobile cutover ships.
    """
    settings = get_settings()
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Try JWT first.
    payload: TokenPayload | None = None
    try:
        payload = decode_token(token, expected_typ="access")
    except HTTPException:
        payload = None

    if payload is not None:
        if await is_jti_denylisted_async(payload.jti):
            raise HTTPException(status_code=401, detail="token revoked")
        if not await is_family_active_async(payload.fam):
            raise HTTPException(status_code=401, detail="session revoked")

        try:
            user_uuid = uuid.UUID(payload.sub)
        except ValueError as e:
            raise HTTPException(status_code=401, detail="invalid subject") from e

        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="user not found")
        if token_predates_password_change(payload.iat, user):
            raise HTTPException(status_code=401, detail="session expired")
        return user

    # Fall back to static api_token in DEBUG only.
    if settings.debug:
        result = await db.execute(select(User).where(User.api_token == token))
        user = result.scalar_one_or_none()
        if user is not None:
            return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
