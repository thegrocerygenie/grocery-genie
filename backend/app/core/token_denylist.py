"""Redis-backed JWT denylist + refresh-family invalidation.

Two namespaces:
- `gg:auth:deny:<jti>` — single-token revocation. Set with TTL = remaining
  token lifetime so entries auto-expire.
- `gg:auth:fam:<fam_id>:revoked` — family-wide revocation. Used for sign-out
  (kills all paired access+refresh tokens) and refresh-token reuse detection.

Reuses the Celery broker connection in settings.redis_url.
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache

import redis.asyncio as redis_async
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings

log = logging.getLogger(__name__)

_DENY_PREFIX = "gg:auth:deny:"
_FAM_PREFIX = "gg:auth:fam:"


# ── Async (used by FastAPI request path) ────────────────────────────


@lru_cache
def _async_client() -> redis_async.Redis:
    settings = get_settings()
    return redis_async.from_url(settings.redis_url, decode_responses=True)


async def add_jti_async(jti: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    try:
        await _async_client().set(f"{_DENY_PREFIX}{jti}", "1", ex=ttl_seconds)
    except RedisError:
        log.exception("denylist add_jti failed for jti=%s", jti)


async def is_jti_denylisted_async(jti: str) -> bool:
    try:
        result = await _async_client().exists(f"{_DENY_PREFIX}{jti}")
        return bool(result)
    except RedisError:
        log.exception("denylist lookup failed for jti=%s", jti)
        # Fail open: a Redis outage shouldn't lock everyone out. Audit log
        # surfaces this so ops can tell the difference.
        return False


async def invalidate_family_async(family_id: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        ttl_seconds = 60
    try:
        await _async_client().set(
            f"{_FAM_PREFIX}{family_id}:revoked", "1", ex=ttl_seconds
        )
    except RedisError:
        log.exception("family invalidate failed for fam=%s", family_id)


async def is_family_active_async(family_id: str) -> bool:
    try:
        result = await _async_client().exists(f"{_FAM_PREFIX}{family_id}:revoked")
        return not bool(result)
    except RedisError:
        log.exception("family lookup failed for fam=%s", family_id)
        return True  # Fail open.


async def acquire_refresh_lock_async(jti: str, ttl_seconds: int = 5) -> bool:
    """Take a short-lived lock to serialize concurrent refresh-token rotations.

    Returns True if the caller acquired the lock; False if another caller is
    already mid-rotation. The losing caller should retry the refresh after a
    short delay.
    """
    try:
        return bool(
            await _async_client().set(
                f"{_FAM_PREFIX}lock:{jti}", "1", ex=ttl_seconds, nx=True
            )
        )
    except RedisError:
        log.exception("refresh lock failed for jti=%s", jti)
        return True  # Fail open — at worst we get the rotation race.


# ── Sync helpers (for Celery tasks if ever needed) ──────────────────


@lru_cache
def _sync_client() -> Redis:
    settings = get_settings()
    return Redis.from_url(settings.redis_url, decode_responses=True)


def add_jti_sync(jti: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    try:
        _sync_client().set(f"{_DENY_PREFIX}{jti}", "1", ex=ttl_seconds)
    except RedisError:
        log.exception("sync denylist add_jti failed")


def invalidate_family_sync(family_id: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        ttl_seconds = 60
    try:
        _sync_client().set(f"{_FAM_PREFIX}{family_id}:revoked", "1", ex=ttl_seconds)
    except RedisError:
        log.exception("sync family invalidate failed")


# ── Test helper ─────────────────────────────────────────────────────


async def _flush_for_tests() -> None:
    """Clear all denylist keys. Tests only — do not call from app code."""
    client = _async_client()
    try:
        keys: list[str] = []
        async for key in client.scan_iter(match=f"{_DENY_PREFIX}*"):
            keys.append(key)
        async for key in client.scan_iter(match=f"{_FAM_PREFIX}*"):
            keys.append(key)
        if keys:
            await client.delete(*keys)
    except RedisError:
        # In tests with no Redis, allow callers to no-op via patching.
        pass


__all__ = [
    "add_jti_async",
    "add_jti_sync",
    "acquire_refresh_lock_async",
    "invalidate_family_async",
    "invalidate_family_sync",
    "is_family_active_async",
    "is_jti_denylisted_async",
]


# Keep asyncio import live so importers don't lint-warn about unused symbols.
_ = asyncio
