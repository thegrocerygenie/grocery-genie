"""Google Sign In token verification.

Uses google-auth's verify_oauth2_token which fetches the JWKS, verifies the
signature, audience, issuer, and expiry. We pass the audience explicitly to
prevent the common "audience=None" footgun.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.core.config import get_settings

log = logging.getLogger(__name__)

_VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str | None


async def verify_google_id_token(id_token: str) -> GoogleIdentity:
    """Validate a Google ID token; return the user identity.

    Raises ValueError on any validation failure.
    """
    settings = get_settings()
    if not settings.google_client_id:
        raise ValueError("google client id not configured")

    def _verify() -> dict:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        return google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            audience=settings.google_client_id,
        )

    try:
        claims = await asyncio.to_thread(_verify)
    except Exception as e:
        log.warning("google id_token verify failed: %s", e)
        raise ValueError("invalid google token") from e

    issuer = claims.get("iss", "")
    if issuer not in _VALID_ISSUERS:
        raise ValueError(f"unexpected issuer: {issuer!r}")

    audience = claims.get("aud")
    if audience != settings.google_client_id:
        raise ValueError("audience mismatch")

    sub = claims.get("sub")
    email = claims.get("email")
    if not sub or not email:
        raise ValueError("token missing required claims")

    return GoogleIdentity(
        sub=str(sub),
        email=str(email),
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name"),
    )
