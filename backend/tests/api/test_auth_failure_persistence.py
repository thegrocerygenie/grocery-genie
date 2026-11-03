"""Auth failure-path writes survive the request's rollback.

`get_db` commits after the route returns and rolls back on any exception,
HTTPException included. Sign-in failures and refresh-token reuse write state
(the lockout counter, audit rows) and then raise, so these tests run the
routes against a `get_db` with the same semantics: a fresh session per
request, commit on success, rollback on exception. The `yield db_session`
override in the other API tests never rolls back and hides the bug.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.database import AuthEvent, User

PASSWORD = "TestPass1234!"
WRONG = "WrongPass9999!"
THRESHOLD = 3


@pytest.fixture(autouse=True)
def _reset_rate_limit_state():
    from app.core.rate_limit import reset_ip_state

    reset_ip_state()
    yield
    reset_ip_state()


@pytest.fixture(autouse=True)
def _low_lockout_threshold(monkeypatch):
    from app.services import auth as auth_service

    fake = auth_service.get_settings().model_copy(
        update={"signin_lockout_threshold": THRESHOLD}
    )
    monkeypatch.setattr(auth_service, "get_settings", lambda: fake)


@pytest.fixture
def denylisted(monkeypatch) -> set[str]:
    """Stub the Redis denylist; a JTI in the returned set reads as rotated."""
    from app.services import auth as auth_service

    jtis: set[str] = set()

    async def _noop(*_a, **_k) -> None:
        return None

    async def _true(*_a, **_k) -> bool:
        return True

    async def _is_denylisted(jti: str) -> bool:
        return jti in jtis

    async def _send(**_k) -> None:
        return None

    monkeypatch.setattr(auth_service, "add_jti_async", _noop)
    monkeypatch.setattr(auth_service, "invalidate_family_async", _noop)
    monkeypatch.setattr(auth_service, "is_family_active_async", _true)
    monkeypatch.setattr(auth_service, "acquire_refresh_lock_async", _true)
    monkeypatch.setattr(auth_service, "is_jti_denylisted_async", _is_denylisted)
    monkeypatch.setattr(auth_service, "send_verify_email", _send)
    return jtis


@pytest.fixture
def sessions(db_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def real_tx_client(
    sessions, denylisted, mock_extractor
) -> AsyncGenerator[AsyncClient, None]:
    """A client whose get_db behaves like production's: one transaction per
    request, committed on success and rolled back on any exception."""
    from app.core.dependencies import get_db
    from app.llm.provider import get_receipt_extractor
    from main import app

    async def transactional_get_db():
        async with sessions() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = transactional_get_db
    app.dependency_overrides[get_receipt_extractor] = lambda: mock_extractor
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_receipt_extractor, None)


async def _sign_up(client: AsyncClient, email: str) -> dict:
    resp = await client.post(
        "/api/auth/sign-up", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _sign_in(client: AsyncClient, email: str, password: str):
    return await client.post(
        "/api/auth/sign-in", json={"email": email, "password": password}
    )


async def _events(sessions, event_type: str) -> list[AuthEvent]:
    async with sessions() as s:
        rows = await s.execute(
            select(AuthEvent).where(AuthEvent.event_type == event_type)
        )
        return list(rows.scalars())


async def _user(sessions, email: str) -> User:
    async with sessions() as s:
        result = await s.execute(select(User).where(User.email == email))
        return result.scalar_one()


async def test_wrong_passwords_lock_the_account(real_tx_client, sessions):
    email = "lockme@test.com"
    await _sign_up(real_tx_client, email)

    for _ in range(THRESHOLD):
        resp = await _sign_in(real_tx_client, email, WRONG)
        assert resp.status_code == 401, resp.text

    user = await _user(sessions, email)
    assert user.locked_until is not None
    assert user.last_failed_signin_at is not None

    # The right password is refused while the lock holds.
    locked = await _sign_in(real_tx_client, email, PASSWORD)
    assert locked.status_code == 423, locked.text


async def test_failed_sign_in_counts_persist_below_the_threshold(
    real_tx_client, sessions
):
    email = "counted@test.com"
    await _sign_up(real_tx_client, email)

    await _sign_in(real_tx_client, email, WRONG)
    await _sign_in(real_tx_client, email, WRONG)

    user = await _user(sessions, email)
    assert user.failed_signin_count == 2
    assert user.locked_until is None


async def test_bad_password_records_a_signin_failure(real_tx_client, sessions):
    email = "audit@test.com"
    await _sign_up(real_tx_client, email)

    resp = await _sign_in(real_tx_client, email, WRONG)
    assert resp.status_code == 401

    events = await _events(sessions, "signin_failure")
    assert len(events) == 1
    assert events[0].user_id == (await _user(sessions, email)).id
    assert events[0].event_metadata == {"reason": "bad_password"}


async def test_unknown_email_records_a_signin_failure(real_tx_client, sessions):
    resp = await _sign_in(real_tx_client, "nobody@test.com", WRONG)
    assert resp.status_code == 401

    events = await _events(sessions, "signin_failure")
    assert len(events) == 1
    assert events[0].user_id is None
    assert events[0].event_metadata["reason"] == "no_user"


async def test_sign_in_while_locked_records_a_lockout(real_tx_client, sessions):
    email = "lockaudit@test.com"
    await _sign_up(real_tx_client, email)
    for _ in range(THRESHOLD):
        await _sign_in(real_tx_client, email, WRONG)

    resp = await _sign_in(real_tx_client, email, PASSWORD)
    assert resp.status_code == 423

    events = await _events(sessions, "lockout")
    assert len(events) == 1
    assert events[0].user_id == (await _user(sessions, email)).id


async def test_successful_sign_in_clears_the_counter(real_tx_client, sessions):
    email = "recovers@test.com"
    await _sign_up(real_tx_client, email)
    await _sign_in(real_tx_client, email, WRONG)

    resp = await _sign_in(real_tx_client, email, PASSWORD)
    assert resp.status_code == 200, resp.text

    user = await _user(sessions, email)
    assert user.failed_signin_count == 0
    assert user.last_failed_signin_at is None
    assert len(await _events(sessions, "signin_success")) == 1


async def _replay_rotated_refresh(client: AsyncClient, denylisted, token: str):
    from app.core.security import decode_token

    denylisted.add(decode_token(token, expected_typ="refresh").jti)
    return await client.post("/api/auth/refresh", json={"refresh_token": token})


async def test_refresh_token_reuse_records_an_event(
    real_tx_client, sessions, denylisted
):
    email = "reuse@test.com"
    pair = await _sign_up(real_tx_client, email)

    resp = await _replay_rotated_refresh(
        real_tx_client, denylisted, pair["refresh_token"]
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["message"] == "token reuse detected"

    events = await _events(sessions, "token_reuse_detected")
    assert len(events) == 1
    assert events[0].user_id == (await _user(sessions, email)).id


async def test_refresh_token_reuse_by_a_deleted_user_records_no_user(
    real_tx_client, sessions, denylisted
):
    """auth_events.user_id references users.id: an event for a deleted user
    must not name it, or Postgres refuses the row."""
    email = "gone@test.com"
    pair = await _sign_up(real_tx_client, email)
    user_id = (await _user(sessions, email)).id
    async with sessions() as s:
        await s.execute(delete(AuthEvent).where(AuthEvent.user_id == user_id))
        await s.execute(delete(User).where(User.id == user_id))
        await s.commit()

    resp = await _replay_rotated_refresh(
        real_tx_client, denylisted, pair["refresh_token"]
    )
    assert resp.status_code == 400, resp.text

    events = await _events(sessions, "token_reuse_detected")
    assert len(events) == 1
    assert events[0].user_id is None
    assert events[0].event_metadata["family"]


async def test_failed_sign_up_still_rolls_back(real_tx_client, sessions):
    """Success paths keep one transaction: a refused sign-up writes nothing."""
    email = "dup-tx@test.com"
    await _sign_up(real_tx_client, email)

    resp = await real_tx_client.post(
        "/api/auth/sign-up", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 409

    async with sessions() as s:
        users = await s.scalar(select(func.count()).select_from(User))
        signups = await s.scalar(
            select(func.count())
            .select_from(AuthEvent)
            .where(AuthEvent.event_type == "signup")
        )
    assert (users, signups) == (1, 1)
