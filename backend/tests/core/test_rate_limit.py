"""Rate limit counts are shared by every API worker process.

Production runs several Uvicorn workers. With counts in each process's
memory, every worker allows the full limit, so a caller gets the limit times
the worker count. The Redis store keeps one count for all of them.

The Redis tests need a Redis server: set GG_TEST_REDIS_URL, or run
`make db-up` (the dev Redis listens on 54441). Without one they skip.
"""

import asyncio
import logging
import os
import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis

from app.core import rate_limit
from app.core.config import Settings
from app.core.rate_limit import RateLimitMiddleware, RedisRateLimitStore

TEST_REDIS_URL = os.environ.get("GG_TEST_REDIS_URL", "redis://localhost:54441/15")


async def _redis_available() -> bool:
    client = Redis.from_url(TEST_REDIS_URL, socket_connect_timeout=0.5)
    try:
        return bool(await client.ping())
    except Exception:
        return False
    finally:
        await client.aclose()


@pytest.fixture
async def redis_url() -> str:
    if not await _redis_available():
        pytest.skip(f"no Redis at {TEST_REDIS_URL}")
    return TEST_REDIS_URL


@pytest.fixture
def prefix() -> str:
    """A key prefix of its own, so tests never see each other's counts."""
    return f"gg-test:{uuid.uuid4().hex}:"


def test_settings_default_to_the_redis_store(monkeypatch):
    monkeypatch.delenv("GG_RATE_LIMIT_STORAGE", raising=False)
    assert Settings(_env_file=None).rate_limit_storage == "redis"


async def test_two_workers_share_one_limit(redis_url, prefix):
    # Two stores with their own connections stand in for two worker processes.
    worker_a = RedisRateLimitStore(redis_url, key_prefix=prefix)
    worker_b = RedisRateLimitStore(redis_url, key_prefix=prefix)
    try:
        results = [
            await store.hit("ip:203.0.113.9", window=60, limit=3)
            for store in (worker_a, worker_b, worker_a, worker_b)
        ]
    finally:
        await worker_a.close()
        await worker_b.close()

    assert results == [True, True, True, False]


async def test_a_hit_leaves_the_window(redis_url, prefix):
    store = RedisRateLimitStore(redis_url, key_prefix=prefix)
    try:
        assert await store.hit("ip:a", window=0.2, limit=1) is True
        assert await store.hit("ip:a", window=0.2, limit=1) is False
        await asyncio.sleep(0.3)
        assert await store.hit("ip:a", window=0.2, limit=1) is True
    finally:
        await store.close()


async def test_redis_keys_do_not_hold_the_bearer_token(redis_url, prefix):
    token = "secret-bearer-token-value"
    store = RedisRateLimitStore(redis_url, key_prefix=prefix)
    client = Redis.from_url(redis_url)
    try:
        await store.hit(f"read:{token}", window=60, limit=5)
        keys = [key.decode() async for key in client.scan_iter(f"{prefix}*")]
    finally:
        await store.close()
        await client.aclose()

    assert len(keys) == 1
    assert token not in keys[0]


async def test_unreachable_redis_lets_requests_through(caplog):
    store = RedisRateLimitStore("redis://127.0.0.1:1/0", key_prefix="gg-test:")
    try:
        with caplog.at_level(logging.WARNING, logger="app.core.rate_limit"):
            allowed = [await store.hit("ip:a", window=60, limit=1) for _ in range(3)]
    finally:
        await store.close()

    # Failing closed would turn a Redis outage into an API outage.
    assert allowed == [True, True, True]
    # One warning, not one per request.
    assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 1


def _worker_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.post("/api/auth/sign-in")
    async def sign_in() -> dict:
        return {"ok": True}

    return app


async def test_auth_ip_limit_holds_across_two_api_workers(
    redis_url, prefix, monkeypatch
):
    settings = Settings(
        _env_file=None,
        rate_limit_storage="redis",
        redis_url=redis_url,
        auth_ip_rate_limit_per_minute=3,
    )
    monkeypatch.setattr(rate_limit, "get_settings", lambda: settings)
    monkeypatch.setattr(rate_limit, "REDIS_KEY_PREFIX", prefix)

    statuses = []
    for _ in range(2):
        for app in (_worker_app(), _worker_app()):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post("/api/auth/sign-in")
                statuses.append(response.status_code)
    await rate_limit.close_stores()

    assert statuses == [200, 200, 200, 429]
