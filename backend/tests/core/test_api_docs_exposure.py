"""Launch §2 / DoD box 20: production serves no API docs. /docs, /redoc and
/openapi.json describe every route and schema; only debug builds show them."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from main import docs_urls


async def _status(app: FastAPI, path: str) -> int:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        return (await c.get(path)).status_code


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
async def test_production_serves_no_api_docs(path):
    assert await _status(FastAPI(**docs_urls(debug=False)), path) == 404


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
async def test_debug_keeps_the_api_docs(path):
    assert await _status(FastAPI(**docs_urls(debug=True)), path) == 200
