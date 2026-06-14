"""H7 auth hardening: lockout window, session cutoff, Apple verify, token logging."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import (
    hash_password,
    token_predates_password_change,
)
from app.models.database import User
from app.services import apple_auth, auth, email

# ── #1 session cutoff helper ────────────────────────────────────────


def _user(**overrides) -> User:
    base = dict(id=uuid.uuid4(), email="u@test.com", name="U")
    base.update(overrides)
    return User(**base)


def test_token_predates_password_change_true_when_older():
    changed = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
    user = _user(password_updated_at=changed)
    iat = int((changed - timedelta(seconds=10)).timestamp())
    assert token_predates_password_change(iat, user) is True


def test_token_predates_password_change_false_when_newer():
    changed = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
    user = _user(password_updated_at=changed)
    iat = int((changed + timedelta(seconds=10)).timestamp())
    assert token_predates_password_change(iat, user) is False


def test_token_predates_password_change_false_when_never_changed():
    assert token_predates_password_change(0, _user(password_updated_at=None)) is False


# ── #4 sliding-window lockout ───────────────────────────────────────


@pytest.mark.asyncio
async def test_failed_signin_outside_window_resets_count(db_session):
    settings = auth.get_settings()
    user = _user(
        email="lock@test.com",
        password_hash=hash_password("CorrectHorse12!"),
        failed_signin_count=settings.signin_lockout_threshold - 1,
        last_failed_signin_at=datetime.now(UTC)
        - timedelta(seconds=settings.signin_lockout_window_seconds + 60),
    )
    db_session.add(user)
    await db_session.flush()

    with pytest.raises(auth.InvalidCredentialsError):
        await auth.sign_in(db_session, email="lock@test.com", password="wrong")

    # Previous failures were outside the window, so this counts as the first.
    assert user.failed_signin_count == 1
    assert user.locked_until is None


@pytest.mark.asyncio
async def test_failed_signin_within_window_accumulates(db_session):
    settings = auth.get_settings()
    user = _user(
        email="lock2@test.com",
        password_hash=hash_password("CorrectHorse12!"),
        failed_signin_count=settings.signin_lockout_threshold - 1,
        last_failed_signin_at=datetime.now(UTC) - timedelta(seconds=10),
    )
    db_session.add(user)
    await db_session.flush()

    with pytest.raises(auth.InvalidCredentialsError):
        await auth.sign_in(db_session, email="lock2@test.com", password="wrong")

    # Within the window → threshold reached → account locked.
    assert user.locked_until is not None


# ── #2 Apple exchanged id_token is verified, not trusted ────────────


@pytest.mark.asyncio
async def test_apple_exchange_id_token_is_verified(monkeypatch):
    verified_tokens: list[str] = []

    async def fake_decode(token: str) -> dict:
        verified_tokens.append(token)
        return {"sub": "apple-sub-123", "email": "a@test.com", "email_verified": True}

    async def fake_exchange(_code: str) -> dict:
        return {"access_token": "x", "id_token": "exchanged.jwt.token"}

    monkeypatch.setattr(apple_auth, "_decode_apple_jwt", fake_decode)
    monkeypatch.setattr(apple_auth, "_exchange_authorization_code", fake_exchange)

    identity = await apple_auth.verify_apple_sign_in(
        identity_token="identity.jwt.token",
        authorization_code="code",
        nonce=None,
    )
    assert identity.sub == "apple-sub-123"
    # Both the identity token AND the exchanged id_token must be verified.
    assert "identity.jwt.token" in verified_tokens
    assert "exchanged.jwt.token" in verified_tokens


@pytest.mark.asyncio
async def test_apple_sub_mismatch_rejected(monkeypatch):
    async def fake_decode(token: str) -> dict:
        # Identity token and exchanged token resolve to different subjects.
        sub = "sub-A" if token == "identity.jwt.token" else "sub-B"
        return {"sub": sub}

    async def fake_exchange(_code: str) -> dict:
        return {"access_token": "x", "id_token": "exchanged.jwt.token"}

    monkeypatch.setattr(apple_auth, "_decode_apple_jwt", fake_decode)
    monkeypatch.setattr(apple_auth, "_exchange_authorization_code", fake_exchange)

    with pytest.raises(ValueError, match="sub mismatch"):
        await apple_auth.verify_apple_sign_in(
            identity_token="identity.jwt.token",
            authorization_code="code",
            nonce=None,
        )


# ── #3 raw tokens are never logged ──────────────────────────────────


@pytest.mark.asyncio
async def test_reset_email_does_not_log_raw_token(monkeypatch, caplog):
    sent: list[dict] = []

    class _Capture:
        async def send(self, **kwargs) -> None:
            sent.append(kwargs)

    monkeypatch.setattr(email, "get_email_client", lambda: _Capture())

    secret = "super-secret-raw-token-value"
    with caplog.at_level(logging.INFO):
        await email.send_reset_password_email(to="x@test.com", token=secret)

    assert all(secret not in rec.getMessage() for rec in caplog.records)
