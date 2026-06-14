"""Transactional email — Resend with log-only fallback.

Falls back to logging the deep-link URL when `resend_api_key` isn't set so
local dev doesn't need a real provider.
"""

from __future__ import annotations

import logging
from typing import Protocol

from jinja2 import Template

from app.core.config import get_settings

log = logging.getLogger(__name__)


VERIFY_EMAIL_TEMPLATE = Template(
    """\
<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; padding: 24px;">
  <h1 style="font-size: 22px;">Verify your email</h1>
  <p>Tap the button to confirm <strong>{{ email }}</strong> on Grocery Genie.</p>
  <p>
    <a href="{{ link }}"
       style="display: inline-block; background: #1F7A4A; color: #fff; padding: 12px 20px;
              border-radius: 12px; text-decoration: none; font-weight: 600;">
      Verify email
    </a>
  </p>
  <p style="color: #666; font-size: 12px;">If you didn't sign up, you can safely ignore this email.</p>
</body></html>
"""
)


RESET_PASSWORD_TEMPLATE = Template(
    """\
<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; padding: 24px;">
  <h1 style="font-size: 22px;">Reset your password</h1>
  <p>We received a request to reset the Grocery Genie password for <strong>{{ email }}</strong>.</p>
  <p>
    <a href="{{ link }}"
       style="display: inline-block; background: #1F7A4A; color: #fff; padding: 12px 20px;
              border-radius: 12px; text-decoration: none; font-weight: 600;">
      Reset password
    </a>
  </p>
  <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
</body></html>
"""
)


EMAIL_CHANGE_TEMPLATE = Template(
    """\
<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; padding: 24px;">
  <h1 style="font-size: 22px;">Confirm your new email</h1>
  <p>You requested to change your Grocery Genie email to <strong>{{ new_email }}</strong>.</p>
  <p>If this was you, tap the button below to confirm. If not, your account is safe — just ignore this email and consider changing your password.</p>
  <p>
    <a href="{{ link }}"
       style="display: inline-block; background: #1F7A4A; color: #fff; padding: 12px 20px;
              border-radius: 12px; text-decoration: none; font-weight: 600;">
      Confirm email change
    </a>
  </p>
</body></html>
"""
)


class EmailClient(Protocol):
    async def send(self, *, to: str, subject: str, html: str) -> None: ...


class LogOnlyEmailClient:
    """Default for dev/test — writes the URL + subject to the log."""

    async def send(self, *, to: str, subject: str, html: str) -> None:
        log.info("[email:dev] to=%s subject=%s", to, subject)
        log.info("[email:dev:body] %s", html.replace("\n", " "))


class ResendEmailClient:
    def __init__(self, api_key: str, from_address: str):
        self._api_key = api_key
        self._from = from_address

    async def send(self, *, to: str, subject: str, html: str) -> None:
        # Resend's official Python SDK is sync; wrap in a thread so we don't
        # block the event loop.
        import asyncio

        import resend  # type: ignore[import-untyped]

        resend.api_key = self._api_key

        def _send() -> None:
            resend.Emails.send(  # type: ignore[attr-defined]
                {
                    "from": self._from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                }
            )

        await asyncio.to_thread(_send)


def get_email_client() -> EmailClient:
    settings = get_settings()
    if settings.resend_api_key:
        return ResendEmailClient(settings.resend_api_key, settings.resend_from)
    return LogOnlyEmailClient()


# ── High-level helpers ─────────────────────────────────────────────


def _deep_link(path: str, token: str) -> str:
    settings = get_settings()
    return f"{settings.app_scheme}://{path}?token={token}"


async def send_verify_email(*, to: str, token: str) -> None:
    # NOTE: never log `link`/`token` — the raw token is a live credential and
    # log aggregation would capture it. The LogOnlyEmailClient (dev fallback)
    # surfaces the link locally; production uses Resend.
    settings = get_settings()
    link = _deep_link(settings.verify_email_path, token)
    log.info("[email] verification email queued for %s", to)
    html = VERIFY_EMAIL_TEMPLATE.render(email=to, link=link)
    await get_email_client().send(
        to=to, subject="Verify your Grocery Genie email", html=html
    )


async def send_reset_password_email(*, to: str, token: str) -> None:
    settings = get_settings()
    link = _deep_link(settings.reset_password_path, token)
    log.info("[email] password-reset email queued for %s", to)
    html = RESET_PASSWORD_TEMPLATE.render(email=to, link=link)
    await get_email_client().send(
        to=to, subject="Reset your Grocery Genie password", html=html
    )


async def send_email_change_email(*, to: str, new_email: str, token: str) -> None:
    settings = get_settings()
    link = _deep_link(settings.email_change_path, token)
    log.info("[email] email-change email queued for %s", to)
    html = EMAIL_CHANGE_TEMPLATE.render(new_email=new_email, link=link)
    await get_email_client().send(
        to=to, subject="Confirm your Grocery Genie email change", html=html
    )
