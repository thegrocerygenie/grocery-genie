import hashlib
import logging
import time
import uuid
from collections import defaultdict
from typing import Protocol

from fastapi import HTTPException
from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import Settings, get_settings
from app.core.security import decode_token

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "gg:ratelimit:"

# NFR 7 counts receipt submissions on their own: the scan and manual entry.
RECEIPT_SUBMISSIONS = {("POST", "/api/receipts/scan"), ("POST", "/api/receipts")}
# Each refresh reads RevenueCat's REST API (V11-P0): counted on its own.
PREMIUM_REFRESH = ("POST", "/api/users/me/premium/refresh")
# Each claim may send an email to an address the user typed (V11-P5).
WAITLIST_CLAIM = ("POST", "/api/users/me/waitlist-offer/claim")


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


async def allow(key: str, *, window: float, limit: int) -> bool:
    """Count one hit for ``key`` in the shared store; False past ``limit`` in
    the last ``window`` seconds. For limits keyed on something only a route
    can read, such as a request body field."""
    return await _store_for(get_settings()).hit(key, window=window, limit=limit)


def reset_ip_state() -> None:
    """Clear every in-memory counter. Test-only helper."""
    _memory_store.clear()


def _too_many(detail: str, retry_after: str) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": detail},
        headers={"Retry-After": retry_after},
    )


class RateLimitMiddleware:
    """Sliding window rate limiter.

    Five tiers:
    - Receipt submissions (RECEIPT_SUBMISSIONS): keyed by user,
      cap = max_receipt_submissions_per_hour
    - Waitlist claims (WAITLIST_CLAIM), each a possible email: keyed by
      user, cap = max_waitlist_claims_per_hour. The route adds a per-target
      email cap through ``allow``.
    - Premium refreshes (PREMIUM_REFRESH), each a RevenueCat REST read:
      keyed by user, cap = max_premium_refreshes_per_minute
    - Every other authenticated request, reads and writes alike: keyed by
      user, cap = max_reads_per_minute. Analytics and push-token calls count
      here, so they never use up the scan allowance.
    - Unauthenticated /api/auth/* POSTs: keyed by client IP,
      cap = auth_ip_rate_limit_per_minute

    Skips rate limiting for /health. Counts live in Redis by default, so all
    API workers share them (GG_RATE_LIMIT_STORAGE).

    Plain ASGI, not Starlette's BaseHTTPMiddleware: the app gets the server's
    own ``receive``, so a route sees its client disconnect
    (``request.is_disconnected()``, which stops an export build). Behind a
    BaseHTTPMiddleware that check never reports it. Lifespan and websocket
    scopes pass through untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        refusal = await self._refusal(Request(scope))
        if refusal is not None:
            await refusal(scope, receive, send)
            return
        await self.app(scope, receive, send)

    def _extract_token(self, request: Request) -> str | None:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
        return None

    def _caller_key(self, token: str) -> str:
        """The user an access token names, so a new sign-in keeps the count.

        This only reads the user id; get_current_user still checks revocation.
        A token that isn't a valid access JWT (the debug api_token) is counted
        on its own.
        """
        try:
            return f"user:{decode_token(token, expected_typ='access').sub}"
        except HTTPException:
            return f"token:{token}"

    async def _refusal(self, request: Request) -> JSONResponse | None:
        """The 429 for a request past its limit, or None to let it through."""
        path = request.url.path

        if path == "/health":
            return None

        token = self._extract_token(request)
        # Read settings each request — supports tests overriding limits
        # without app re-init, and the cost is one lru_cache lookup.
        settings = get_settings()
        store = _store_for(settings)

        if token is not None:
            caller = self._caller_key(token)
            if (request.method, path) in RECEIPT_SUBMISSIONS:
                allowed = await store.hit(
                    f"submit:{caller}",
                    window=3600.0,
                    limit=settings.max_receipt_submissions_per_hour,
                )
                if not allowed:
                    return _too_many("Rate limit exceeded. Try again later.", "60")
            elif (request.method, path) == WAITLIST_CLAIM:
                allowed = await store.hit(
                    f"waitlist-claim:{caller}",
                    window=3600.0,
                    limit=settings.max_waitlist_claims_per_hour,
                )
                if not allowed:
                    return _too_many("Rate limit exceeded. Try again later.", "600")
            elif (request.method, path) == PREMIUM_REFRESH:
                allowed = await store.hit(
                    f"premium-refresh:{caller}",
                    window=60.0,
                    limit=settings.max_premium_refreshes_per_minute,
                )
                if not allowed:
                    return _too_many("Rate limit exceeded. Try again later.", "60")
            else:
                allowed = await store.hit(
                    f"request:{caller}",
                    window=60.0,
                    limit=settings.max_reads_per_minute,
                )
                if not allowed:
                    return _too_many("Rate limit exceeded. Try again later.", "10")
            return None

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

        return None
