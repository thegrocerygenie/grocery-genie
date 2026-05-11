"""Apple + Google JWKs cache (Redis, 24h TTL).

Public keys for verifying social identity tokens come from each provider's
JWKS endpoint. The keys rotate on the order of months but are fetched on
every sign-in unless cached.

Cache miss falls through to a live HTTP fetch with a short timeout; we never
block sign-in waiting for a slow provider — the fallback returns the most
recent successfully-fetched value if available.
"""

from __future__ import annotations

import json
import logging
import time
from functools import lru_cache
from typing import Any

import httpx
import redis.asyncio as redis_async
from redis.exceptions import RedisError

from app.core.config import get_settings

log = logging.getLogger(__name__)

_PREFIX = "gg:auth:jwks:"
_TTL_SECONDS = 60 * 60 * 24  # 24h
_FETCH_TIMEOUT = 4.0

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"


@lru_cache
def _client() -> redis_async.Redis:
    settings = get_settings()
    return redis_async.from_url(settings.redis_url, decode_responses=True)


async def _fetch_jwks(url: str) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT) as ac:
            resp = await ac.get(url)
            resp.raise_for_status()
            return resp.json()
    except (httpx.HTTPError, ValueError):
        log.exception("jwks fetch failed: %s", url)
        return None


async def _get_cached(key: str) -> dict[str, Any] | None:
    try:
        raw = await _client().get(key)
    except RedisError:
        log.exception("jwks redis read failed for %s", key)
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def _set_cached(key: str, value: dict[str, Any]) -> None:
    try:
        await _client().set(key, json.dumps(value), ex=_TTL_SECONDS)
    except RedisError:
        log.exception("jwks redis write failed for %s", key)


async def get_apple_jwks() -> dict[str, Any] | None:
    return await _get_or_fetch(f"{_PREFIX}apple", APPLE_JWKS_URL)


async def get_google_jwks() -> dict[str, Any] | None:
    return await _get_or_fetch(f"{_PREFIX}google", GOOGLE_JWKS_URL)


async def _get_or_fetch(cache_key: str, url: str) -> dict[str, Any] | None:
    cached = await _get_cached(cache_key)
    if cached:
        return cached
    fetched = await _fetch_jwks(url)
    if fetched:
        await _set_cached(cache_key, fetched)
    return fetched


# Coarse local memo so high-volume paths aren't I/O-bound on Redis either.
_LOCAL: dict[str, tuple[float, dict[str, Any]]] = {}
_LOCAL_TTL = 300.0  # 5 min in-process memo on top of Redis


async def get_apple_jwks_memo() -> dict[str, Any] | None:
    return await _get_with_memo("apple", get_apple_jwks)


async def get_google_jwks_memo() -> dict[str, Any] | None:
    return await _get_with_memo("google", get_google_jwks)


async def _get_with_memo(label: str, fetcher) -> dict[str, Any] | None:
    now = time.monotonic()
    entry = _LOCAL.get(label)
    if entry and now - entry[0] < _LOCAL_TTL:
        return entry[1]
    value = await fetcher()
    if value:
        _LOCAL[label] = (now, value)
    return value
