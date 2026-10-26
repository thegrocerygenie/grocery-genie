"""POST/DELETE /api/users/me/push-tokens — Expo push token registration."""

from httpx import AsyncClient
from sqlalchemy import select

from app.models.database import PushToken
from tests.conftest import DEV_USER_ID, USER_B_ID

TOKEN = "ExponentPushToken[abc123XYZ]"


async def _tokens(db_session) -> list[PushToken]:
    result = await db_session.execute(select(PushToken))
    return list(result.scalars().all())


async def test_register_push_token(client: AsyncClient, db_session):
    resp = await client.post("/api/users/me/push-tokens", json={"token": TOKEN})

    assert resp.status_code == 204
    tokens = await _tokens(db_session)
    assert [(t.user_id, t.token) for t in tokens] == [(DEV_USER_ID, TOKEN)]


async def test_register_same_token_twice_keeps_one_row(client: AsyncClient, db_session):
    for _ in range(2):
        resp = await client.post("/api/users/me/push-tokens", json={"token": TOKEN})
        assert resp.status_code == 204

    assert len(await _tokens(db_session)) == 1


async def test_token_moves_to_the_account_that_registers_it(
    client: AsyncClient, db_session
):
    """A device that signs in to a new account stops getting the old one's alerts."""
    db_session.add(PushToken(user_id=USER_B_ID, token=TOKEN))
    await db_session.flush()

    resp = await client.post("/api/users/me/push-tokens", json={"token": TOKEN})

    assert resp.status_code == 204
    tokens = await _tokens(db_session)
    assert [(t.user_id, t.token) for t in tokens] == [(DEV_USER_ID, TOKEN)]


async def test_register_rejects_non_expo_token(client: AsyncClient):
    resp = await client.post(
        "/api/users/me/push-tokens", json={"token": "not-a-push-token"}
    )
    assert resp.status_code == 422


async def test_unregister_push_token(client: AsyncClient, db_session):
    await client.post("/api/users/me/push-tokens", json={"token": TOKEN})

    resp = await client.request(
        "DELETE", "/api/users/me/push-tokens", json={"token": TOKEN}
    )

    assert resp.status_code == 204
    assert await _tokens(db_session) == []


async def test_unregister_leaves_other_users_token(client: AsyncClient, db_session):
    db_session.add(PushToken(user_id=USER_B_ID, token=TOKEN))
    await db_session.flush()

    resp = await client.request(
        "DELETE", "/api/users/me/push-tokens", json={"token": TOKEN}
    )

    assert resp.status_code == 204
    assert [t.user_id for t in await _tokens(db_session)] == [USER_B_ID]
