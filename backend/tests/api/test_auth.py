"""Tests for /api/auth and /api/users routes.

Stubs Redis (the JWT denylist + JWKS cache) and the email client so the
suite doesn't need real infra.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture(autouse=True)
def _reset_rate_limit_state():
    """Wipe IP rate-limit state between tests so the suite doesn't trip the
    per-IP cap on /api/auth/* (every test uses the same test-client IP)."""
    from app.core.rate_limit import reset_ip_state

    reset_ip_state()
    yield
    reset_ip_state()


@pytest.fixture(autouse=True)
def _stub_redis_and_email(monkeypatch):
    """Patch out the Redis-backed denylist and the email send."""
    from app.core import token_denylist
    from app.services import email as email_service

    sent: list[dict] = []

    async def _add_jti(*_a, **_k) -> None:
        return None

    async def _is_denylisted(*_a, **_k) -> bool:
        return False

    async def _invalidate_family(*_a, **_k) -> None:
        return None

    async def _is_family_active(*_a, **_k) -> bool:
        return True

    async def _acquire_lock(*_a, **_k) -> bool:
        return True

    monkeypatch.setattr(token_denylist, "add_jti_async", _add_jti)
    monkeypatch.setattr(token_denylist, "is_jti_denylisted_async", _is_denylisted)
    monkeypatch.setattr(token_denylist, "invalidate_family_async", _invalidate_family)
    monkeypatch.setattr(token_denylist, "is_family_active_async", _is_family_active)
    monkeypatch.setattr(token_denylist, "acquire_refresh_lock_async", _acquire_lock)
    # Also patch in security.py since it imports them by name.
    from app.core import security

    monkeypatch.setattr(security, "is_jti_denylisted_async", _is_denylisted)
    monkeypatch.setattr(security, "is_family_active_async", _is_family_active)
    # And in services.auth (which imported the same names).
    from app.services import auth as auth_service

    monkeypatch.setattr(auth_service, "add_jti_async", _add_jti)
    monkeypatch.setattr(auth_service, "is_jti_denylisted_async", _is_denylisted)
    monkeypatch.setattr(auth_service, "invalidate_family_async", _invalidate_family)
    monkeypatch.setattr(auth_service, "is_family_active_async", _is_family_active)
    monkeypatch.setattr(auth_service, "acquire_refresh_lock_async", _acquire_lock)

    async def _send(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(email_service, "send_verify_email", _send)
    monkeypatch.setattr(email_service, "send_reset_password_email", _send)
    monkeypatch.setattr(email_service, "send_email_change_email", _send)
    # Also patch the names imported into services.auth.
    monkeypatch.setattr(auth_service, "send_verify_email", _send)
    monkeypatch.setattr(auth_service, "send_reset_password_email", _send)
    monkeypatch.setattr(auth_service, "send_email_change_email", _send)

    yield sent


@pytest.fixture
async def auth_client(db_session, mock_extractor) -> AsyncGenerator[AsyncClient, None]:
    """A client without auth-override — exercises real /api/auth endpoints."""
    from app.core.dependencies import get_db
    from app.llm.provider import get_receipt_extractor
    from main import app

    async def override_get_db():
        yield db_session

    def override_get_extractor():
        return mock_extractor

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_receipt_extractor] = override_get_extractor

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Sign up ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_signup_returns_token_pair(auth_client):
    resp = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "newuser@test.com", "password": "TestPass1234!"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"
    # Fresh sign-up has no budget yet — client should route to onboarding.
    assert body["needs_onboarding"] is True


@pytest.mark.asyncio
async def test_signup_duplicate_email_409(auth_client):
    payload = {"email": "dup@test.com", "password": "TestPass1234!"}
    first = await auth_client.post("/api/auth/sign-up", json=payload)
    assert first.status_code == 201
    second = await auth_client.post("/api/auth/sign-up", json=payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_signup_weak_password_422(auth_client):
    resp = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "weak@test.com", "password": "short1"},
    )
    assert resp.status_code == 422


# ── Sign in ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_signin_after_signup_succeeds(auth_client):
    payload = {"email": "signin@test.com", "password": "TestPass1234!"}
    await auth_client.post("/api/auth/sign-up", json=payload)
    resp = await auth_client.post("/api/auth/sign-in", json=payload)
    assert resp.status_code == 200
    assert resp.json()["access_token"]


@pytest.mark.asyncio
async def test_signin_wrong_password_401(auth_client):
    await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "user@test.com", "password": "TestPass1234!"},
    )
    resp = await auth_client.post(
        "/api/auth/sign-in",
        json={"email": "user@test.com", "password": "wrong-password"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_signin_unknown_email_401(auth_client):
    resp = await auth_client.post(
        "/api/auth/sign-in",
        json={"email": "nobody@test.com", "password": "TestPass1234!"},
    )
    assert resp.status_code == 401


# ── /me ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_returns_profile_after_signup(auth_client):
    resp = await auth_client.post(
        "/api/auth/sign-up",
        json={
            "email": "me@test.com",
            "password": "TestPass1234!",
            "name": "Test User",
        },
    )
    assert resp.status_code == 201
    token = resp.json()["access_token"]

    me = await auth_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "me@test.com"
    assert body["name"] == "Test User"
    assert body["preferences"]["notification_thresholds"] == {
        "fifty": False,
        "eighty": True,
        "hundred": True,
    }


# ── Verify email ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_email_flow(auth_client, db_session):
    from sqlalchemy import select

    from app.models.database import User

    await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "verify@test.com", "password": "TestPass1234!"},
    )
    user = (
        await db_session.execute(select(User).where(User.email == "verify@test.com"))
    ).scalar_one()
    assert user.email_verification_token_hash is not None
    assert user.email_verified_at is None

    # Need the raw token to confirm — the email send is stubbed, but our service
    # writes the hash and returns the raw via send_verify_email kwargs. Pull
    # from the audit `metadata` is one path; simpler: directly mint a fresh
    # raw token in this test.
    from app.core.security import generate_email_token, hash_email_token

    raw = generate_email_token()
    user.email_verification_token_hash = hash_email_token(raw)
    await db_session.flush()

    resp = await auth_client.post("/api/auth/verify-email", json={"token": raw})
    assert resp.status_code == 200
    await db_session.refresh(user)
    assert user.email_verified_at is not None
    assert user.email_verification_token_hash is None


# ── Refresh ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_password_change_invalidates_existing_tokens(auth_client, db_session):
    """H7: a token issued before the last password change is rejected."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.models.database import User

    resp = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "reset-inv@test.com", "password": "TestPass1234!"},
    )
    token = resp.json()["access_token"]

    me = await auth_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200

    # Simulate a password reset occurring after this token was minted.
    user = (
        await db_session.execute(select(User).where(User.email == "reset-inv@test.com"))
    ).scalar_one()
    user.password_updated_at = datetime.now(UTC) + timedelta(seconds=5)
    await db_session.flush()

    me_after = await auth_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me_after.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rotates_pair(auth_client):
    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "refresh@test.com", "password": "TestPass1234!"},
    )
    refresh_token = sign_up.json()["refresh_token"]

    resp = await auth_client.post(
        "/api/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert resp.status_code == 200
    new_pair = resp.json()
    assert new_pair["refresh_token"] != refresh_token
    # Refresh does not recompute onboarding state — must default to false
    # explicitly (not omitted) so the mobile TokenPair shape stays consistent.
    assert "needs_onboarding" in new_pair
    assert new_pair["needs_onboarding"] is False


# ── PATCH /api/users/me ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_preferences(auth_client):
    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "prefs@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    patch = await auth_client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "notification_thresholds": {"fifty": True},
            "weekly_summary": {"day": 5},
            "ocr_languages": ["en", "fr"],
        },
    )
    assert patch.status_code == 200
    profile = patch.json()
    assert profile["preferences"]["notification_thresholds"]["fifty"] is True
    assert (
        profile["preferences"]["notification_thresholds"]["eighty"] is True
    )  # default kept
    assert profile["preferences"]["weekly_summary"]["day"] == 5
    assert profile["preferences"]["ocr_languages"] == ["en", "fr"]


@pytest.mark.asyncio
async def test_ocr_languages_replace_not_merge(auth_client):
    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "ocr@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    await auth_client.patch(
        "/api/users/me", headers=headers, json={"ocr_languages": ["en", "fr"]}
    )
    resp = await auth_client.patch(
        "/api/users/me", headers=headers, json={"ocr_languages": ["es"]}
    )
    assert resp.json()["preferences"]["ocr_languages"] == ["es"]


# ── Manual receipt + soft-delete ────────────────────────────────


@pytest.mark.asyncio
async def test_manual_receipt_creation(auth_client, db_session):
    from app.core.seed import seed_default_categories

    await seed_default_categories(db_session)

    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "manual@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "store_name": "Manual Mart",
        "date": "2026-04-30",
        "total": 12.50,
        "subtotal": 11.50,
        "tax": 1.00,
        "items": [
            {"name": "Apples", "quantity": 1, "unit_price": 5.00, "total_price": 5.00},
            {"name": "Bread", "quantity": 1, "unit_price": 6.50, "total_price": 6.50},
        ],
    }
    resp = await auth_client.post("/api/receipts", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "confirmed"
    assert len(body["items"]) == 2


# ── needs_onboarding predicate ──────────────────────────────────


@pytest.mark.asyncio
async def test_me_returns_needs_onboarding_true_until_budget_set(auth_client):
    """OnboardingGate hardening: /api/auth/me reports needs_onboarding so the
    mobile client can hydrate routing state on app launch."""
    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "me_needs@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_before = await auth_client.get("/api/auth/me", headers=headers)
    assert me_before.status_code == 200
    assert me_before.json()["needs_onboarding"] is True

    create_budget = await auth_client.post(
        "/api/budgets",
        headers=headers,
        json={
            "amount": 400.0,
            "period_type": "monthly",
            "period_start": "2026-05-01",
        },
    )
    assert create_budget.status_code == 201

    me_after = await auth_client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 200
    assert me_after.json()["needs_onboarding"] is False


@pytest.mark.asyncio
async def test_users_me_patch_preserves_needs_onboarding(auth_client):
    """PATCH /api/users/me returns needs_onboarding so React Query cache stays
    consistent when preferences change before onboarding is complete."""
    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "patch_needs@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    patch = await auth_client.patch(
        "/api/users/me",
        headers=headers,
        json={"notification_thresholds": {"fifty": True}},
    )
    assert patch.status_code == 200
    assert patch.json()["needs_onboarding"] is True


@pytest.mark.asyncio
async def test_signin_without_budget_needs_onboarding(auth_client):
    """User who signed up but never set a budget gets routed back to onboarding."""
    payload = {"email": "no_budget@test.com", "password": "TestPass1234!"}
    await auth_client.post("/api/auth/sign-up", json=payload)
    resp = await auth_client.post("/api/auth/sign-in", json=payload)
    assert resp.status_code == 200
    assert resp.json()["needs_onboarding"] is True


@pytest.mark.asyncio
async def test_signin_with_budget_does_not_need_onboarding(auth_client):
    """After setting a monthly budget, sign-in routes straight to /(tabs)."""
    payload = {"email": "with_budget@test.com", "password": "TestPass1234!"}
    sign_up = await auth_client.post("/api/auth/sign-up", json=payload)
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_budget = await auth_client.post(
        "/api/budgets",
        headers=headers,
        json={
            "amount": 400.0,
            "period_type": "monthly",
            "period_start": "2026-05-01",
        },
    )
    assert create_budget.status_code == 201, create_budget.text

    resp = await auth_client.post("/api/auth/sign-in", json=payload)
    assert resp.status_code == 200
    assert resp.json()["needs_onboarding"] is False


@pytest.mark.asyncio
async def test_signin_after_soft_deleted_budget_needs_onboarding(auth_client):
    """A soft-deleted budget should not count — user is back to needing onboarding."""
    payload = {"email": "deleted_budget@test.com", "password": "TestPass1234!"}
    sign_up = await auth_client.post("/api/auth/sign-up", json=payload)
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_budget = await auth_client.post(
        "/api/budgets",
        headers=headers,
        json={
            "amount": 400.0,
            "period_type": "monthly",
            "period_start": "2026-05-01",
        },
    )
    budget_id = create_budget.json()["id"]
    deleted = await auth_client.delete(f"/api/budgets/{budget_id}", headers=headers)
    assert deleted.status_code == 204

    resp = await auth_client.post("/api/auth/sign-in", json=payload)
    assert resp.status_code == 200
    assert resp.json()["needs_onboarding"] is True


# ── Apple sign-in ───────────────────────────────────────────────


@pytest.fixture
def stub_apple_verifier(monkeypatch):
    """Replace Apple identity verification with an in-memory map.

    By default returns an AppleIdentity whose sub == identity_token, so test
    cases can use the identity_token field as a pseudo-sub. Tests can also
    install explicit AppleIdentity entries to exercise email-linking.
    """
    from app.api.routes import auth as auth_route
    from app.services.apple_auth import AppleIdentity

    identities: dict[str, AppleIdentity] = {}

    async def _verify(*, identity_token, authorization_code, nonce=None):
        if identity_token in identities:
            return identities[identity_token]
        return AppleIdentity(
            sub=identity_token,
            email=f"{identity_token}@example.com",
            email_verified=True,
        )

    monkeypatch.setattr(auth_route, "verify_apple_sign_in", _verify)
    return identities


@pytest.mark.asyncio
async def test_apple_signin_new_user_needs_onboarding(auth_client, stub_apple_verifier):
    resp = await auth_client.post(
        "/api/auth/apple",
        json={"identity_token": "apple_new_sub", "authorization_code": "code"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["needs_onboarding"] is True


@pytest.mark.asyncio
async def test_apple_signin_returning_user_with_budget(
    auth_client, stub_apple_verifier
):
    """Second call with same sub after the user creates a budget → false."""
    first = await auth_client.post(
        "/api/auth/apple",
        json={"identity_token": "apple_returning", "authorization_code": "code"},
    )
    assert first.json()["needs_onboarding"] is True
    token = first.json()["access_token"]

    create_budget = await auth_client.post(
        "/api/budgets",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount": 400.0,
            "period_type": "monthly",
            "period_start": "2026-05-01",
        },
    )
    assert create_budget.status_code == 201

    second = await auth_client.post(
        "/api/auth/apple",
        json={"identity_token": "apple_returning", "authorization_code": "code"},
    )
    assert second.status_code == 200
    assert second.json()["needs_onboarding"] is False


@pytest.mark.asyncio
async def test_apple_links_existing_email_user_without_budget(
    auth_client, db_session, stub_apple_verifier
):
    """Linked-account branch: Apple matches an existing verified email user
    who never finished onboarding (no budget). Predicate must still be true.
    """
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.database import User
    from app.services.apple_auth import AppleIdentity

    await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "link_no_budget@test.com", "password": "TestPass1234!"},
    )
    user = (
        await db_session.execute(
            select(User).where(User.email == "link_no_budget@test.com")
        )
    ).scalar_one()
    user.email_verified_at = datetime.now(tz=UTC)
    await db_session.flush()

    stub_apple_verifier["link_no_budget_token"] = AppleIdentity(
        sub="apple_sub_for_link_no_budget",
        email="link_no_budget@test.com",
        email_verified=True,
    )

    resp = await auth_client.post(
        "/api/auth/apple",
        json={
            "identity_token": "link_no_budget_token",
            "authorization_code": "code",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["needs_onboarding"] is True

    await db_session.refresh(user)
    assert user.apple_subject == "apple_sub_for_link_no_budget"


@pytest.mark.asyncio
async def test_apple_links_existing_email_user_with_budget(
    auth_client, db_session, stub_apple_verifier
):
    """Linked-account with existing budget → false (no re-onboarding)."""
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.database import User
    from app.services.apple_auth import AppleIdentity

    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "link_with_budget@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    await auth_client.post(
        "/api/budgets",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount": 400.0,
            "period_type": "monthly",
            "period_start": "2026-05-01",
        },
    )
    user = (
        await db_session.execute(
            select(User).where(User.email == "link_with_budget@test.com")
        )
    ).scalar_one()
    user.email_verified_at = datetime.now(tz=UTC)
    await db_session.flush()

    stub_apple_verifier["link_with_budget_token"] = AppleIdentity(
        sub="apple_sub_for_link_with_budget",
        email="link_with_budget@test.com",
        email_verified=True,
    )

    resp = await auth_client.post(
        "/api/auth/apple",
        json={
            "identity_token": "link_with_budget_token",
            "authorization_code": "code",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["needs_onboarding"] is False


# ── Google sign-in ──────────────────────────────────────────────


@pytest.fixture
def stub_google_verifier(monkeypatch):
    from app.api.routes import auth as auth_route
    from app.services.google_auth import GoogleIdentity

    identities: dict[str, GoogleIdentity] = {}

    async def _verify(id_token):
        if id_token in identities:
            return identities[id_token]
        return GoogleIdentity(
            sub=id_token,
            email=f"{id_token}@example.com",
            email_verified=True,
            name="Test User",
        )

    monkeypatch.setattr(auth_route, "verify_google_id_token", _verify)
    return identities


@pytest.mark.asyncio
async def test_google_signin_new_user_needs_onboarding(
    auth_client, stub_google_verifier
):
    resp = await auth_client.post(
        "/api/auth/google", json={"id_token": "google_new_sub"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["needs_onboarding"] is True


@pytest.mark.asyncio
async def test_google_signin_returning_user_with_budget(
    auth_client, stub_google_verifier
):
    first = await auth_client.post(
        "/api/auth/google", json={"id_token": "google_returning"}
    )
    assert first.json()["needs_onboarding"] is True
    token = first.json()["access_token"]

    await auth_client.post(
        "/api/budgets",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount": 400.0,
            "period_type": "monthly",
            "period_start": "2026-05-01",
        },
    )

    second = await auth_client.post(
        "/api/auth/google", json={"id_token": "google_returning"}
    )
    assert second.status_code == 200
    assert second.json()["needs_onboarding"] is False


# ── IP-based rate limit on unauthenticated /api/auth/* ─────────


@pytest.mark.asyncio
async def test_auth_ip_rate_limit_returns_429(auth_client, monkeypatch):
    """Unauthenticated /api/auth/* POSTs are capped per source IP."""
    from app.core import rate_limit

    real = rate_limit.get_settings()
    fake = real.model_copy(update={"auth_ip_rate_limit_per_minute": 3})
    monkeypatch.setattr(rate_limit, "get_settings", lambda: fake)

    for i in range(3):
        resp = await auth_client.post(
            "/api/auth/sign-up",
            json={"email": f"rl{i}@test.com", "password": "TestPass1234!"},
        )
        # 201 (new) or 409 (dup-ish) are both fine — we only care that the
        # request reached the handler, not 429.
        assert resp.status_code in (201, 409, 422), (
            f"req {i}: {resp.status_code} {resp.text}"
        )

    blocked = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "rl_blocked@test.com", "password": "TestPass1234!"},
    )
    assert blocked.status_code == 429
    assert blocked.headers.get("Retry-After") == "60"


@pytest.mark.asyncio
async def test_auth_ip_rate_limit_does_not_affect_authenticated_routes(
    auth_client, monkeypatch
):
    """A user with a valid Bearer token must not be blocked by the IP cap."""
    from app.core import rate_limit

    real = rate_limit.get_settings()
    fake = real.model_copy(update={"auth_ip_rate_limit_per_minute": 1})
    monkeypatch.setattr(rate_limit, "get_settings", lambda: fake)

    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "rl_authed@test.com", "password": "TestPass1234!"},
    )
    assert sign_up.status_code == 201
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Even though IP limit is 1 and we already used it on sign-up, authed GET
    # should still work — token-keyed read counter is a separate bucket.
    me1 = await auth_client.get("/api/auth/me", headers=headers)
    me2 = await auth_client.get("/api/auth/me", headers=headers)
    assert me1.status_code == 200
    assert me2.status_code == 200


@pytest.mark.asyncio
async def test_soft_delete_then_restore(auth_client, db_session):
    from app.core.seed import seed_default_categories

    await seed_default_categories(db_session)

    sign_up = await auth_client.post(
        "/api/auth/sign-up",
        json={"email": "delete@test.com", "password": "TestPass1234!"},
    )
    token = sign_up.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create = await auth_client.post(
        "/api/receipts",
        headers=headers,
        json={
            "store_name": "Soft",
            "date": "2026-04-30",
            "total": 5,
            "items": [{"name": "X", "unit_price": 5, "total_price": 5}],
        },
    )
    receipt_id = create.json()["id"]

    deleted = await auth_client.delete(f"/api/receipts/{receipt_id}", headers=headers)
    assert deleted.status_code == 204

    listed = await auth_client.get("/api/receipts", headers=headers)
    assert all(r["id"] != receipt_id for r in listed.json()["items"])

    deleted_list = await auth_client.get(
        "/api/receipts/recently-deleted", headers=headers
    )
    assert any(r["id"] == receipt_id for r in deleted_list.json())

    restored = await auth_client.post(
        f"/api/receipts/{receipt_id}/restore", headers=headers
    )
    assert restored.status_code == 200

    relisted = await auth_client.get("/api/receipts", headers=headers)
    assert any(r["id"] == receipt_id for r in relisted.json()["items"])
