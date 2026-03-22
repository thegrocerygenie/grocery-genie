import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter.

    Two tiers:
    - Write operations (POST/PUT/PATCH/DELETE): max_receipt_submissions_per_hour
    - Read operations (GET): max_reads_per_minute

    Skips rate limiting for /api/health and unauthenticated requests.
    MVP uses in-memory storage; production should use Redis.
    """

    def __init__(self, app):
        super().__init__(app)
        self._settings = get_settings()
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
        # Skip rate limiting for health endpoint
        if request.url.path == "/health":
            return await call_next(request)

        token = self._extract_token(request)
        if token is None:
            # Unauthenticated — auth middleware will reject, no need to rate limit
            return await call_next(request)

        now = time.monotonic()

        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            window = 3600.0  # 1 hour
            limit = self._settings.max_receipt_submissions_per_hour
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
            limit = self._settings.max_reads_per_minute
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
