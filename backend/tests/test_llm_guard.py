"""The suite never calls a real LLM.

The ``llm_guard`` fixture in ``tests/conftest.py`` blocks ``litellm.acompletion``
in every test outside ``tests/llm_validation/``, and the test apps use the mock
category assigner.
"""

import io
import logging
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import litellm
import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.llm.provider import LiteLLMCategoryAssigner, get_category_assigner
from tests.conftest import LLMGuard, RealLLMCallError


async def _scan(client: AsyncClient, image_bytes: bytes):
    return await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
    )


async def test_guard_blocks_a_real_llm_call(llm_guard: LLMGuard):
    with pytest.raises(RealLLMCallError):
        await litellm.acompletion(model="any", messages=[])

    assert len(llm_guard.calls) == 1
    # This test trips the guard on purpose; clear it so teardown passes.
    llm_guard.calls.clear()


def test_guard_fails_a_test_that_calls_the_real_llm(tmp_path: Path):
    """Run a leaking test in its own pytest and check that it fails."""
    backend = Path(__file__).parents[1]
    (tmp_path / "conftest.py").write_text(
        "from tests.conftest import llm_guard  # noqa: F401\n"
    )
    (tmp_path / "test_leak.py").write_text(
        textwrap.dedent(
            """
            import asyncio

            import litellm


            def test_leak():
                try:
                    asyncio.run(litellm.acompletion(model="any", messages=[]))
                except Exception:
                    pass  # swallowed, as ReceiptService does
            """
        )
    )

    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(tmp_path), "-p", "no:cacheprovider"],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(backend)},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1, result.stdout
    assert "1 passed, 1 error" in result.stdout
    assert "1 real LLM call(s) blocked" in result.stdout


async def test_guard_catches_a_call_the_service_swallows(
    client: AsyncClient,
    test_image_bytes: bytes,
    llm_guard: LLMGuard,
    monkeypatch: pytest.MonkeyPatch,
):
    """ReceiptService catches the assigner's error and falls back, so the
    raise alone can't fail the test. The guard records the call too."""
    from main import app

    # Keep the expected fallback error out of the suite's log.
    service_logger = logging.getLogger("app.services.receipt_service")
    monkeypatch.setattr(service_logger, "disabled", True)

    app.dependency_overrides[get_category_assigner] = lambda: LiteLLMCategoryAssigner(
        get_settings()
    )

    resp = await _scan(client, test_image_bytes)

    assert resp.status_code == 200
    assert len(llm_guard.calls) == 1
    llm_guard.calls.clear()


async def test_scan_uses_the_mock_category_assigner(
    client: AsyncClient,
    test_image_bytes: bytes,
    llm_guard: LLMGuard,
    caplog: pytest.LogCaptureFixture,
):
    with caplog.at_level(logging.WARNING):
        resp = await _scan(client, test_image_bytes)

    assert resp.status_code == 200
    assert llm_guard.calls == []
    assert "Category assignment failed" not in caplog.text
