"""The harness finds the LLM key where the app does: the environment or .env."""

from app.core.config import get_settings
from tests.llm_validation.conftest import llm_configured


def _configured_with_dotenv(tmp_path, monkeypatch, dotenv: str) -> bool:
    monkeypatch.delenv("GG_LLM_API_KEY", raising=False)
    (tmp_path / ".env").write_text(dotenv)
    monkeypatch.chdir(tmp_path)
    get_settings.cache_clear()
    try:
        return llm_configured()
    finally:
        get_settings.cache_clear()


def test_key_in_dotenv_counts_as_configured(tmp_path, monkeypatch):
    assert _configured_with_dotenv(tmp_path, monkeypatch, "GG_LLM_API_KEY=test-key\n")


def test_no_key_is_not_configured(tmp_path, monkeypatch):
    assert not _configured_with_dotenv(tmp_path, monkeypatch, "GG_DEBUG=true\n")
