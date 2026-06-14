"""Apple Sign In token verification + authorization_code exchange.

Two-step flow per Apple's spec:
1. Verify the identity_token JWT against Apple's JWKs (iss/aud/exp/nonce).
2. Exchange the authorization_code at https://appleid.apple.com/auth/token
   to confirm it wasn't a replay. Apple's response includes a matching `sub`.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx
import jwt

from app.core.config import get_settings
from app.core.jwks_cache import get_apple_jwks_memo

log = logging.getLogger(__name__)

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_ISSUER = "https://appleid.apple.com"


@dataclass(frozen=True)
class AppleIdentity:
    sub: str
    email: str | None
    email_verified: bool


def _build_client_secret() -> str:
    """Generate the ES256-signed client_secret JWT Apple expects."""
    settings = get_settings()
    if not (
        settings.apple_team_id
        and settings.apple_key_id
        and settings.apple_client_id
        and settings.apple_private_key
    ):
        raise ValueError("apple credentials not configured")

    now = int(time.time())
    payload = {
        "iss": settings.apple_team_id,
        "iat": now,
        "exp": now + 60 * 5,  # short-lived; we mint per-request
        "aud": APPLE_ISSUER,
        "sub": settings.apple_client_id,
    }
    headers = {"kid": settings.apple_key_id, "alg": "ES256"}
    return jwt.encode(
        payload,
        settings.apple_private_key,
        algorithm="ES256",
        headers=headers,
    )


def _select_apple_key(jwks: dict, kid: str) -> dict | None:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def _decode_apple_jwt(token: str) -> dict:
    """Verify an Apple-issued JWT against Apple's JWKs (signature/aud/iss/exp)."""
    settings = get_settings()
    if not settings.apple_client_id:
        raise ValueError("apple client id not configured")

    headers = jwt.get_unverified_header(token)
    kid = headers.get("kid")
    if not kid:
        raise ValueError("apple token missing kid")

    jwks = await get_apple_jwks_memo()
    if jwks is None:
        raise ValueError("apple jwks unavailable")

    key = _select_apple_key(jwks, kid)
    if key is None:
        raise ValueError("no matching apple key")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)  # type: ignore[arg-type]
    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer=APPLE_ISSUER,
        )
    except jwt.InvalidTokenError as e:
        raise ValueError(f"apple token invalid: {e}") from e


async def _verify_identity_token(
    identity_token: str, expected_nonce: str | None
) -> dict:
    claims = await _decode_apple_jwt(identity_token)

    if expected_nonce:
        # Apple SHA-256-hashes the nonce that's submitted from the client.
        import hashlib

        expected_hash = hashlib.sha256(expected_nonce.encode("utf-8")).hexdigest()
        if (
            claims.get("nonce") != expected_hash
            and claims.get("nonce") != expected_nonce
        ):
            raise ValueError("apple nonce mismatch")

    return claims


async def _exchange_authorization_code(authorization_code: str) -> dict:
    settings = get_settings()
    client_secret = _build_client_secret()
    payload = {
        "client_id": settings.apple_client_id,
        "client_secret": client_secret,
        "code": authorization_code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=8.0) as ac:
        resp = await ac.post(
            APPLE_TOKEN_URL,
            data=payload,
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise ValueError(f"apple token exchange failed: {resp.status_code} {resp.text}")
    body = resp.json()
    if not body.get("access_token") or not body.get("id_token"):
        raise ValueError("apple token response missing fields")
    return body


async def verify_apple_sign_in(
    *,
    identity_token: str,
    authorization_code: str,
    nonce: str | None,
) -> AppleIdentity:
    """Validate Apple identity_token AND exchange authorization_code.

    Both must succeed and refer to the same user. Raises ValueError on any
    failure.
    """
    identity_claims, exchange_body = await asyncio.gather(
        _verify_identity_token(identity_token, nonce),
        _exchange_authorization_code(authorization_code),
    )

    sub = identity_claims.get("sub")
    if not sub:
        raise ValueError("identity token missing sub")

    # Re-verify the exchanged id_token — full signature/aud/iss verification
    # against Apple's JWKs (never trust an unverified token's `sub`).
    exchanged_id = exchange_body.get("id_token")
    if not isinstance(exchanged_id, str):
        raise ValueError("apple exchange id_token missing")
    exchanged_claims = await _decode_apple_jwt(exchanged_id)
    if exchanged_claims.get("sub") != sub:
        raise ValueError("apple sub mismatch between identity and exchange")

    return AppleIdentity(
        sub=str(sub),
        email=identity_claims.get("email"),
        email_verified=bool(identity_claims.get("email_verified", True)),
    )
