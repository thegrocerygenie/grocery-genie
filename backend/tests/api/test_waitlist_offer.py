"""The waitlist's free year through the API (V11-P5).

Matching runs on an Apple or Google sign-in, on verify-email and on a
confirmed email change; "Claim your waitlist offer" covers an account whose
email is not the waitlist one (Hide My Email). RevenueCat is faked.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import AsyncGenerator
from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import clock
from app.core.config import get_settings
from app.models.database import User, WaitlistRedemption
from app.services.revenuecat_client import get_revenuecat_client

# Redis and email stubbed, Apple verification faked, as in test_auth.py.
from tests.api.test_auth import (  # noqa: F401
    _reset_rate_limit_state,
    _stub_redis_and_email,
)
from tests.services.test_waitlist_service import (
    CUTOFF,
    LAUNCHED,
    NOW,
    FakeRevenueCat,
    _entry,
)

PASSWORD = "TestPass1234!"


@pytest.fixture
def emails(request) -> list[dict]:
    """Verify and email-change emails sent (test_auth's stub)."""
    return request.getfixturevalue("_stub_redis_and_email")


@pytest.fixture
def apple(monkeypatch) -> dict:
    """Apple sign-in faked: identity token -> identity, or by default a
    verified "<token>@example.com" (like test_auth's stub)."""
    from app.api.routes import auth as auth_route
    from app.services.apple_auth import AppleIdentity

    identities: dict[str, AppleIdentity] = {}

    async def _verify(*, identity_token, authorization_code, nonce=None):
        return identities.get(identity_token) or AppleIdentity(
            sub=identity_token,
            email=f"{identity_token}@example.com",
            email_verified=True,
        )

    monkeypatch.setattr(auth_route, "verify_apple_sign_in", _verify)
    return identities


@pytest.fixture
def rc() -> FakeRevenueCat:
    return FakeRevenueCat()


@pytest.fixture
def offer(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "premium_launched_at", LAUNCHED)
    monkeypatch.setattr(settings, "waitlist_cutoff", CUTOFF)
    monkeypatch.setattr(settings, "waitlist_email_hash_salt", "test-salt")
    monkeypatch.setattr(clock, "now", lambda: NOW)


@pytest.fixture
def claim_emails(monkeypatch) -> list[dict]:
    from app.services import email as email_service

    sent: list[dict] = []

    async def _send(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(email_service, "send_waitlist_claim_email", _send)
    return sent


@pytest.fixture
def claims() -> list[tuple[uuid.UUID, str]]:
    """Claims the route enqueued (the Celery task, faked): (user id, email)."""
    return []


async def _drain(db_session, claims: list[tuple[uuid.UUID, str]]) -> None:
    """Run the queued claim tasks, as the Celery worker would."""
    from app.services.waitlist_service import WaitlistService

    while claims:
        user_id, email = claims.pop(0)
        await WaitlistService(db_session).send_claim_link(user_id, email)


@pytest.fixture
async def api(
    db_session, mock_extractor, rc, claims
) -> AsyncGenerator[AsyncClient, None]:
    from app.api.routes.waitlist import get_claim_dispatcher
    from app.core.dependencies import get_db
    from app.llm.provider import get_receipt_extractor
    from main import app

    async def override_get_db():
        yield db_session

    async def dispatch(user_id: uuid.UUID, email: str) -> None:
        claims.append((user_id, email))

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_claim_dispatcher] = lambda: dispatch
    app.dependency_overrides[get_receipt_extractor] = lambda: mock_extractor
    app.dependency_overrides[get_revenuecat_client] = lambda: rc
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


async def _sign_up(api, email: str) -> dict:
    resp = await api.post(
        "/api/auth/sign-up", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _apple(api, sub: str) -> dict:
    resp = await api.post(
        "/api/auth/apple", json={"identity_token": sub, "authorization_code": "code"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _token(sent: list[dict], to: str) -> str:
    return next(m["token"] for m in reversed(sent) if m["to"] == to)


async def _verify(api, sent: list[dict], email: str):
    return await api.post("/api/auth/verify-email", json={"token": _token(sent, email)})


async def _me(api, headers) -> dict:
    resp = await api.get("/api/users/me", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_verify_email_matches_and_grants_premium(
    api, db_session, offer, rc, emails
):
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "member@example.com")
    # Not verified yet: no match on the email-and-password sign-up itself.
    assert rc.grants == []

    resp = await _verify(api, emails, "member@example.com")

    assert resp.status_code == 200, resp.text
    assert len(rc.grants) == 1
    me = await _me(api, headers)
    assert me["is_premium"] is True
    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()
    assert status["claim_available"] is False
    assert status["redemption"]["status"] == "granted"
    assert status["redemption"]["expires_at"].startswith("2028-01-10")


async def test_apple_sign_in_with_the_waitlist_email_matches(
    api, db_session, offer, rc, apple
):
    await _entry(db_session, "apple_member@example.com")

    headers = await _apple(api, "apple_member")

    assert len(rc.grants) == 1
    assert (await _me(api, headers))["is_premium"] is True


async def test_google_sign_in_with_the_waitlist_email_matches(
    api, db_session, offer, rc, monkeypatch
):
    from app.api.routes import auth as auth_route
    from app.services.google_auth import GoogleIdentity

    async def _verify_google(id_token):
        return GoogleIdentity(
            sub="g-1", email="g@example.com", email_verified=True, name="G"
        )

    monkeypatch.setattr(auth_route, "verify_google_id_token", _verify_google)
    await _entry(db_session, "g@example.com")

    resp = await api.post("/api/auth/google", json={"id_token": "t"})

    assert resp.status_code == 200, resp.text
    assert len(rc.grants) == 1


async def test_confirmed_email_change_matches(api, db_session, offer, rc, emails):
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "old@example.com")
    await _verify(api, emails, "old@example.com")
    assert rc.grants == []
    change = await api.post(
        "/api/users/me/email-change/request",
        headers=headers,
        json={"new_email": "member@example.com", "current_password": PASSWORD},
    )
    assert change.status_code == 202, change.text

    # The confirmation goes to the current email.
    resp = await api.post(
        "/api/users/me/email-change/confirm",
        json={"token": _token(emails, "old@example.com")},
    )

    assert resp.status_code == 200, resp.text
    assert len(rc.grants) == 1


async def test_hide_my_email_claims_through_the_settings_step(
    api, db_session, offer, rc, apple, claim_emails, claims
):
    from app.services.apple_auth import AppleIdentity

    apple["relay"] = AppleIdentity(
        sub="relay", email="x7k2p9@privaterelay.appleid.com", email_verified=True
    )
    await _entry(db_session, "member@example.com")
    headers = await _apple(api, "relay")
    assert rc.grants == []
    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()
    assert status["window_open"] is True
    assert status["claim_available"] is True
    assert status["redemption"] is None
    assert status["closes_at"].startswith("2027-04-01")

    claim = await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "  Member@Example.com "},
    )
    assert claim.status_code == 202, claim.text
    assert claim.json() == {"status": "sent"}
    await _drain(db_session, claims)
    # The link goes to the waitlist inbox, not the account's email.
    assert [m["to"] for m in claim_emails] == ["member@example.com"]
    assert rc.grants == []

    confirm = await api.post(
        "/api/users/me/waitlist-offer/confirm",
        json={"token": claim_emails[0]["token"]},
    )

    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["status"] == "granted"
    assert len(rc.grants) == 1
    assert (await _me(api, headers))["is_premium"] is True
    # The link works once.
    again = await api.post(
        "/api/users/me/waitlist-offer/confirm",
        json={"token": claim_emails[0]["token"]},
    )
    assert again.status_code == 400
    assert again.json()["detail"]["code"] == "invalid_token"


async def test_claim_for_an_email_not_on_the_waitlist_sends_nothing(
    api, db_session, offer, claim_emails, emails, claims
):
    # The same answer either way: the claim step can't look up the waitlist.
    headers = await _sign_up(api, "someone@example.com")

    claim = await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "stranger@example.com"},
    )

    assert claim.status_code == 202
    assert claim.json() == {"status": "sent"}
    await _drain(db_session, claims)
    assert claim_emails == []


async def test_claim_for_a_contact_after_the_cutoff_sends_nothing(
    api, db_session, offer, claim_emails, claims
):
    await _entry(db_session, "late@example.com", created=CUTOFF + timedelta(days=1))
    headers = await _sign_up(api, "someone@example.com")

    claim = await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "late@example.com"},
    )

    assert claim.status_code == 202
    await _drain(db_session, claims)
    assert claim_emails == []


async def test_claim_of_a_waitlist_email_already_redeemed_is_refused_at_confirm(
    api, db_session, offer, rc, claim_emails, emails, claims
):
    await _entry(db_session, "member@example.com")
    claimer = await _sign_up(api, "claimer@example.com")
    await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=claimer,
        json={"email": "member@example.com"},
    )
    await _drain(db_session, claims)
    # Meanwhile the waitlist email's owner signs up with it and verifies.
    await _sign_up(api, "member@example.com")
    await _verify(api, emails, "member@example.com")
    assert len(rc.grants) == 1

    confirm = await api.post(
        "/api/users/me/waitlist-offer/confirm",
        json={"token": claim_emails[0]["token"]},
    )

    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "waitlist_offer_redeemed"
    assert len(rc.grants) == 1


async def test_account_with_a_free_year_cannot_claim_another(
    api, db_session, offer, claim_emails, emails, claims
):
    await _entry(db_session, "member@example.com")
    await _entry(db_session, "second@example.com")
    headers = await _sign_up(api, "member@example.com")
    await _verify(api, emails, "member@example.com")

    claim = await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "second@example.com"},
    )

    assert claim.status_code == 409
    assert claim.json()["detail"]["code"] == "waitlist_offer_redeemed"
    assert claims == []
    assert claim_emails == []


async def test_no_claim_after_the_window_closes(
    api, db_session, offer, monkeypatch, claim_emails, claims
):
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "someone@example.com")
    monkeypatch.setattr(clock, "now", lambda: LAUNCHED + timedelta(days=90))

    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()
    claim = await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "member@example.com"},
    )

    assert status["window_open"] is False and status["claim_available"] is False
    assert claim.status_code == 409
    assert claim.json()["detail"]["code"] == "waitlist_offer_closed"
    assert claims == []
    assert claim_emails == []


async def test_claim_link_tapped_after_the_window_closes_grants_nothing(
    api, db_session, offer, rc, monkeypatch, claim_emails, claims
):
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "someone@example.com")
    await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "member@example.com"},
    )
    await _drain(db_session, claims)
    # The window closes an hour later; the link (24 hours) is still live.
    monkeypatch.setattr(
        get_settings(), "premium_launched_at", NOW - timedelta(days=90, hours=-1)
    )
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(hours=2))

    confirm = await api.post(
        "/api/users/me/waitlist-offer/confirm",
        json={"token": claim_emails[0]["token"]},
    )

    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "waitlist_offer_closed"
    assert rc.grants == []


async def test_expired_claim_link_is_refused(
    api, db_session, offer, monkeypatch, claim_emails, claims
):
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "someone@example.com")
    await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "member@example.com"},
    )
    await _drain(db_session, claims)
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(hours=25))

    confirm = await api.post(
        "/api/users/me/waitlist-offer/confirm",
        json={"token": claim_emails[0]["token"]},
    )

    assert confirm.status_code == 400
    assert confirm.json()["detail"]["code"] == "invalid_token"


async def test_claim_rejects_a_malformed_email(api, offer):
    headers = await _sign_up(api, "someone@example.com")

    claim = await api.post(
        "/api/users/me/waitlist-offer/claim",
        headers=headers,
        json={"email": "not-an-email"},
    )

    assert claim.status_code == 422


async def test_revenuecat_down_keeps_verify_working_and_the_grant_pending(
    api, db_session, offer, rc, emails
):
    rc.fail_grants = 1
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "member@example.com")

    resp = await _verify(api, emails, "member@example.com")

    assert resp.status_code == 200, resp.text
    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()
    assert status["redemption"]["status"] == "pending"
    assert status["claim_available"] is False
    row = (await db_session.execute(select(WaitlistRedemption))).scalar_one()
    assert row.last_error == "revenuecat_unavailable"


async def test_offer_requires_auth(api):
    assert (await api.get("/api/users/me/waitlist-offer")).status_code == 401
    claim = await api.post("/api/users/me/waitlist-offer/claim", json={"email": "a@b"})
    assert claim.status_code == 401


async def test_matching_never_trusts_the_client(api, db_session, offer, rc):
    # An unverified account cannot claim its own unverified email by asking.
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "member@example.com")

    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()

    assert status["redemption"] is None
    user = (
        await db_session.execute(select(User).where(User.email == "member@example.com"))
    ).scalar_one()
    assert user.email_verified_at is None
    assert rc.grants == []


# -- the claim cannot be used to look up the waitlist --------------------------


CLAIM = "/api/users/me/waitlist-offer/claim"


async def test_listed_and_unlisted_claims_answer_alike_and_only_enqueue(
    api, db_session, offer, claim_emails, claims
):
    """Membership must not show in the answer, its timing or its errors: the
    route does no waitlist lookup and sends nothing itself. It enqueues one
    task for any email, and the task does the lookup and the send."""
    await _entry(db_session, "member@example.com")
    listed_user = await _sign_up(api, "a@example.com")
    unlisted_user = await _sign_up(api, "b@example.com")

    listed = await api.post(
        CLAIM, headers=listed_user, json={"email": "member@example.com"}
    )
    unlisted = await api.post(
        CLAIM, headers=unlisted_user, json={"email": "stranger@example.com"}
    )

    assert (listed.status_code, listed.json()) == (202, {"status": "sent"})
    assert (unlisted.status_code, unlisted.json()) == (202, {"status": "sent"})
    assert listed.content == unlisted.content
    # Nothing was looked up, stored or sent inside the request.
    assert claim_emails == []
    users = (await db_session.execute(select(User))).scalars().all()
    assert all(u.waitlist_claim_token_hash is None for u in users)
    assert [email for _, email in claims] == [
        "member@example.com",
        "stranger@example.com",
    ]

    await _drain(db_session, claims)
    assert [m["to"] for m in claim_emails] == ["member@example.com"]


async def test_a_resend_failure_never_reaches_the_client(
    api, db_session, offer, claims, monkeypatch, caplog
):
    from app.services import email as email_service

    async def _down(**kwargs) -> None:
        raise RuntimeError("Resend answered 500")

    monkeypatch.setattr(email_service, "send_waitlist_claim_email", _down)
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "someone@example.com")

    claim = await api.post(CLAIM, headers=headers, json={"email": "member@example.com"})

    assert (claim.status_code, claim.json()) == (202, {"status": "sent"})
    # The worker logs the failure (never the email) and does not raise.
    await _drain(db_session, claims)
    assert "member@example.com" not in caplog.text
    assert "RuntimeError" in caplog.text


async def test_claims_are_limited_per_user(api, offer, claims, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_waitlist_claims_per_hour", 2)
    headers = await _sign_up(api, "someone@example.com")

    codes = [
        (
            await api.post(CLAIM, headers=headers, json={"email": f"x{i}@example.com"})
        ).status_code
        for i in range(3)
    ]

    assert codes == [202, 202, 429]
    assert len(claims) == 2


async def test_claims_for_one_waitlist_email_are_limited_per_account(
    api, offer, claims, monkeypatch
):
    """One account can't flood an inbox: past the limit the answer is the
    same 202, so it shows nothing about the waitlist, and nothing is sent."""
    monkeypatch.setattr(get_settings(), "max_waitlist_claims_per_email_per_day", 2)
    headers = await _sign_up(api, "claimer@example.com")
    answers = []
    for email in ["target@example.com", " Target@Example.com", "target@example.com"]:
        resp = await api.post(CLAIM, headers=headers, json={"email": email})
        answers.append((resp.status_code, resp.json()))

    assert answers == [(202, {"status": "sent"})] * 3
    assert [email for _, email in claims] == ["target@example.com"] * 2


async def test_another_accounts_claims_cannot_lock_out_the_member(
    api, offer, claims, monkeypatch
):
    """Someone who knows a member's waitlist email can't use up its claims."""
    monkeypatch.setattr(get_settings(), "max_waitlist_claims_per_email_per_day", 2)
    attacker = await _sign_up(api, "attacker@example.com")
    for _ in range(3):
        await api.post(CLAIM, headers=attacker, json={"email": "member@example.com"})
    claims.clear()

    member = await _sign_up(api, "relay@privaterelay.appleid.com")
    resp = await api.post(CLAIM, headers=member, json={"email": "member@example.com"})

    assert resp.status_code == 202
    assert len(claims) == 1


async def test_a_failed_grant_shows_as_failed(api, db_session, offer, rc, emails):
    """A grant RevenueCat refused for good is not shown as on its way: the app
    tells the member to contact support."""
    rc.reject_with = 404
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "member@example.com")
    await _verify(api, emails, "member@example.com")

    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()

    assert status["redemption"]["status"] == "failed"
    assert status["claim_available"] is False


# -- sign-in and verify-email never wait long on RevenueCat --------------------


async def test_a_slow_revenuecat_grant_leaves_verify_fast_and_pending(
    api, db_session, offer, rc, emails, monkeypatch
):
    from app.services.waitlist_service import WaitlistService

    monkeypatch.setattr(get_settings(), "waitlist_inline_grant_timeout_seconds", 0.05)
    rc.grant_delay = 5.0
    await _entry(db_session, "member@example.com")
    headers = await _sign_up(api, "member@example.com")

    started = time.monotonic()
    resp = await _verify(api, emails, "member@example.com")

    assert resp.status_code == 200, resp.text
    assert time.monotonic() - started < 2
    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()
    assert status["redemption"]["status"] == "pending"
    row = (await db_session.execute(select(WaitlistRedemption))).scalar_one()
    assert row.last_error == "revenuecat_timeout"
    assert row.last_attempt_at is not None

    # The beat retry, with no request waiting on it, grants it.
    rc.grant_delay = 0
    retried = await WaitlistService(db_session, revenuecat=rc).retry_pending(
        older_than=timedelta(0)
    )
    assert retried == 1


async def test_a_slow_read_back_still_answers_granted(
    api, db_session, offer, rc, monkeypatch, apple
):
    monkeypatch.setattr(get_settings(), "waitlist_inline_grant_timeout_seconds", 0.05)
    rc.read_delay = 5.0
    await _entry(db_session, "apple_member@example.com")

    started = time.monotonic()
    headers = await _apple(api, "apple_member")

    assert time.monotonic() - started < 2
    assert len(rc.grants) == 1
    status = (await api.get("/api/users/me/waitlist-offer", headers=headers)).json()
    assert status["redemption"]["status"] == "granted"
