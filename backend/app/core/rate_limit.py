import hashlib
import logging
import time
import uuid
from collections import defaultdict
from typing import Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "gg:ratelimit:"


class RateLimitStore(Protocol):
    async def hit(self, key: str, window: float, limit: int) -> bool:
        """Record a request for key and return True, or return False when
        key already has limit requests in the last window seconds."""
        ...


class MemoryRateLimitStore:
    """Counts in this process only. For tests: with several API workers, each
    worker would allow the full limit."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def hit(self, key: str, window: float, limit: int) -> bool:
        now = time.monotonic()
        hits = [t for t in self._hits[key] if t > now - window]
        if len(hits) >= limit:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True

    def clear(self) -> None:
        self._hits.clear()


# Sliding window in a sorted set, scored by Redis's own clock so that workers
# with different clocks agree. One script, so the check and the record are
# atomic across workers.
_HIT_SCRIPT = """
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
local window = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then
    return 0
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], math.ceil(window * 1000))
return 1
"""

# After a Redis error, let requests through without trying Redis for this
# long, so an outage costs one slow request instead of one per request.
_REDIS_RETRY_AFTER_SECONDS = 5.0


class RedisRateLimitStore:
    """Counts shared by every API worker.

    When Redis fails, requests go through: failing closed would turn a Redis
    outage into an API outage.
    """

    def __init__(self, url: str, key_prefix: str = REDIS_KEY_PREFIX) -> None:
        self._client = Redis.from_url(
            url, socket_connect_timeout=0.5, socket_timeout=0.5
        )
        self._script = self._client.register_script(_HIT_SCRIPT)
        self._prefix = key_prefix
        self._skip_until = 0.0

    def _redis_key(self, key: str) -> str:
        # Keys can hold a bearer token: store a hash, never the token.
        return self._prefix + hashlib.sha256(key.encode()).hexdigest()

    async def hit(self, key: str, window: float, limit: int) -> bool:
        if time.monotonic() < self._skip_until:
            return True
        try:
            allowed = await self._script(
                keys=[self._redis_key(key)],
                args=[window, limit, uuid.uuid4().hex],
            )
        except (RedisError, OSError) as exc:
            self._skip_until = time.monotonic() + _REDIS_RETRY_AFTER_SECONDS
            logger.warning(
                "Rate limiting is off for %ss: Redis failed (%s)",
                _REDIS_RETRY_AFTER_SECONDS,
                type(exc).__name__,
            )
            return True
        return bool(allowed)

    async def close(self) -> None:
        await self._client.aclose()


_memory_store = MemoryRateLimitStore()
_redis_stores: dict[tuple[str, str], RedisRateLimitStore] = {}


def _store_for(settings: Settings) -> RateLimitStore:
    if settings.rate_limit_storage == "memory":
        return _memory_store
    key = (settings.redis_url, REDIS_KEY_PREFIX)
    if key not in _redis_stores:
        _redis_stores[key] = RedisRateLimitStore(*key)
    return _redis_stores[key]


async def close_stores() -> None:
    """Close the Redis connections. Called at app shutdown."""
    stores = list(_redis_stores.values())
    _redis_stores.clear()
    for store in stores:
        await store.close()


def reset_ip_state() -> None:
    """Clear every in-memory counter. Test-only helper."""
    _memory_store.clear()


def _too_many(detail: str, retry_after: str) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": detail},
        headers={"Retry-After": retry_after},
    )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiter.

    Three tiers:
    - Authenticated writes (POST/PUT/PATCH/DELETE): keyed by token,
      cap = max_receipt_submissions_per_hour
    - Authenticated reads (GET): keyed by token, cap = max_reads_per_minute
    - Unauthenticated /api/auth/* POSTs: keyed by client IP,
      cap = auth_ip_rate_limit_per_minute

    Skips rate limiting for /health. Counts live in Redis by default, so all
    API workers share them (GG_RATE_LIMIT_STORAGE).
    """

    def _extract_token(self, request: Request) -> str | None:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
        return None

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path == "/health":
            return await call_next(request)

        token = self._extract_token(request)
        # Read settings each request — supports tests overriding limits
        # without app re-init, and the cost is one lru_cache lookup.
        settings = get_settings()
        store = _store_for(settings)

        if token is not None:
            if request.method in ("POST", "PUT", "PATCH", "DELETE"):
                allowed = await store.hit(
                    f"write:{token}",
                    window=3600.0,
                    limit=settings.max_receipt_submissions_per_hour,
                )
                if not allowed:
                    return _too_many("Rate limit exceeded. Try again later.", "60")
            else:
                allowed = await store.hit(
                    f"read:{token}",
                    window=60.0,
                    limit=settings.max_reads_per_minute,
                )
                if not allowed:
                    return _too_many("Rate limit exceeded. Try again later.", "10")
            return await call_next(request)

        # Unauthenticated request — enforce per-IP limit on /api/auth/* POSTs.
        # These endpoints make outbound HTTP calls (Apple/Google JWKS, token
        # exchange, email send, bcrypt verification) and must not be open
        # to brute-force or amplification abuse.
        if path.startswith("/api/auth/") and request.method == "POST":
            ip = request.client.host if request.client else "unknown"
            allowed = await store.hit(
                f"ip:{ip}",
                window=60.0,
                limit=settings.auth_ip_rate_limit_per_minute,
            )
            if not allowed:
                return _too_many("Too many requests. Try again later.", "60")

        return await call_next(request)
