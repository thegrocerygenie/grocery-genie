import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings

# Module-level state for IP-based limiting on unauthenticated /api/auth/*
# requests. Module-scoped (not instance) so tests can reset it via
# `reset_ip_state()` between cases — the middleware is wrapped by Starlette
# at app construction and reaching the instance from outside is awkward.
_ip_requests: dict[str, list[float]] = defaultdict(list)


def reset_ip_state() -> None:
    """Clear all per-IP counters. Test-only helper."""
    _ip_requests.clear()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter.

    Three tiers:
    - Authenticated writes (POST/PUT/PATCH/DELETE): keyed by token,
      cap = max_receipt_submissions_per_hour
    - Authenticated reads (GET): keyed by token, cap = max_reads_per_minute
    - Unauthenticated /api/auth/* POSTs: keyed by client IP,
      cap = auth_ip_rate_limit_per_minute

    Skips rate limiting for /health.
    MVP uses in-memory storage; production should use Redis.
    """

    def __init__(self, app):
        super().__init__(app)
        # {token: [(timestamp, ...)]}
        self._write_requests: dict[str, list[float]] = defaultdict(list)
        self._read_requests: dict[str, list[float]] = defaultdict(list)

    def _extract_token(self, request: Request) -> str | None:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
        return None

    def _cleanup_window(
        self, entries: list[float], window_seconds: float
    ) -> list[float]:
        cutoff = time.monotonic() - window_seconds
        return [t for t in entries if t > cutoff]

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path == "/health":
            return await call_next(request)

        token = self._extract_token(request)
        now = time.monotonic()
        # Read settings each request — supports tests overriding limits
        # without app re-init, and the cost is one lru_cache lookup.
        settings = get_settings()

        if token is not None:
            if request.method in ("POST", "PUT", "PATCH", "DELETE"):
                window = 3600.0  # 1 hour
                limit = settings.max_receipt_submissions_per_hour
                self._write_requests[token] = self._cleanup_window(
                    self._write_requests[token], window
                )
                if len(self._write_requests[token]) >= limit:
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Rate limit exceeded. Try again later."},
                        headers={"Retry-After": "60"},
                    )
                self._write_requests[token].append(now)
            else:
                window = 60.0  # 1 minute
                limit = settings.max_reads_per_minute
                self._read_requests[token] = self._cleanup_window(
                    self._read_requests[token], window
                )
                if len(self._read_requests[token]) >= limit:
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Rate limit exceeded. Try again later."},
                        headers={"Retry-After": "10"},
                    )
                self._read_requests[token].append(now)
            return await call_next(request)

        # Unauthenticated request — enforce per-IP limit on /api/auth/* POSTs.
        # These endpoints make outbound HTTP calls (Apple/Google JWKS, token
        # exchange, email send, bcrypt verification) and must not be open
        # to brute-force or amplification abuse.
        if path.startswith("/api/auth/") and request.method == "POST":
            ip = request.client.host if request.client else "unknown"
            window = 60.0
            limit = settings.auth_ip_rate_limit_per_minute
            _ip_requests[ip] = self._cleanup_window(_ip_requests[ip], window)
            if len(_ip_requests[ip]) >= limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Try again later."},
                    headers={"Retry-After": "60"},
                )
            _ip_requests[ip].append(now)

        return await call_next(request)
