"""Email deep links must open a real app screen.

Expo Router maps `grocerygenie://<path>` to the file `mobile/app/<path>.tsx`.
A path with no file opens "Unmatched Route", so no user can verify an email
or reset a password. Signed-out users can open only `onboarding/*` screens.
"""

import logging
import re
from pathlib import Path

import pytest

from app.core.config import Settings
from app.services import email

MOBILE_APP_DIR = Path(__file__).resolve().parents[3] / "mobile" / "app"


class _CapturingClient:
    def __init__(self) -> None:
        self.html = ""

    async def send(self, *, to: str, subject: str, html: str) -> None:
        self.html = html


@pytest.fixture
def captured(monkeypatch) -> _CapturingClient:
    client = _CapturingClient()
    monkeypatch.setattr(email, "get_settings", lambda: Settings())
    monkeypatch.setattr(email, "get_email_client", lambda: client)
    return client


def _link(html: str) -> str:
    match = re.search(r'href="([^"]+)"', html)
    assert match, html
    return match.group(1)


async def test_verify_email_link_opens_the_verify_email_screen(captured):
    await email.send_verify_email(to="a@b.co", token="tok123")

    assert _link(captured.html) == "grocerygenie://onboarding/verify-email?token=tok123"


async def test_reset_password_link_opens_the_reset_password_screen(captured):
    await email.send_reset_password_email(to="a@b.co", token="tok123")

    assert (
        _link(captured.html) == "grocerygenie://onboarding/reset-password?token=tok123"
    )


async def test_email_change_link_opens_the_confirm_screen(captured):
    # Not app/email-change.tsx: that screen requests a change, it can't confirm one.
    await email.send_email_change_email(to="a@b.co", new_email="c@d.co", token="tok123")

    assert (
        _link(captured.html)
        == "grocerygenie://onboarding/confirm-email-change?token=tok123"
    )


@pytest.mark.parametrize(
    "field", ["verify_email_path", "reset_password_path", "email_change_path"]
)
def test_every_deep_link_path_has_an_app_route(field):
    if not MOBILE_APP_DIR.is_dir():
        pytest.skip("mobile/ is not checked out next to backend/")
    path = getattr(Settings(), field)

    assert (MOBILE_APP_DIR / f"{path}.tsx").is_file(), f"no route for {path!r}"


@pytest.mark.parametrize(
    "field", ["verify_email_path", "reset_password_path", "email_change_path"]
)
def test_signed_out_links_stay_inside_onboarding(field):
    # The root layout redirects a signed-out user away from any other screen.
    assert getattr(Settings(), field).startswith("onboarding/")


async def test_log_only_client_logs_the_link_in_debug(monkeypatch, caplog):
    monkeypatch.setattr(email, "get_settings", lambda: Settings(debug=True))
    caplog.set_level(logging.INFO, logger="app.services.email")

    await email.LogOnlyEmailClient().send(
        to="a@b.co", subject="s", html='<a href="grocerygenie://x?token=t">'
    )

    assert "grocerygenie://x?token=t" in caplog.text


async def test_log_only_client_never_logs_the_link_outside_debug(monkeypatch, caplog):
    # The link carries a live token; production logs must not capture it.
    monkeypatch.setattr(email, "get_settings", lambda: Settings(debug=False))
    caplog.set_level(logging.DEBUG, logger="app.services.email")

    await email.LogOnlyEmailClient().send(
        to="a@b.co", subject="s", html='<a href="grocerygenie://x?token=t">'
    )

    assert "token=t" not in caplog.text
    assert "not sent" in caplog.text
