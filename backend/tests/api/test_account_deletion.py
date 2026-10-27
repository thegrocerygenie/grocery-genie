"""DELETE /api/users/me: in-app account deletion (App Store 5.1.1(v)).

The account and everything it owns goes: every row keyed to the user, the
receipts' children, and the receipt image files. A rerun after a crash ends
in the same state, and the deleted account's tokens stop working.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncGenerator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.image.storage import (
    RECEIPT_EXTS,
    LocalFileStorage,
    generate_receipt_path,
    generate_thumbnail_path,
)
from app.models.database import (
    AuthEvent,
    Base,
    Budget,
    BudgetAlertSent,
    Category,
    LineItem,
    Notification,
    Receipt,
    ReceiptCorrection,
    User,
    UserItemMapping,
)
from app.services import account_service

# Redis and email stubbed, as in test_auth.py.
from tests.api.test_auth import (  # noqa: F401
    _reset_rate_limit_state,
    _stub_redis_and_email,
)

PASSWORD = "TestPass1234!"


@pytest.fixture
async def api_client(db_session, mock_extractor) -> AsyncGenerator[AsyncClient, None]:
    """A client with no auth override: requests carry real JWTs."""
    from app.core.dependencies import get_db
    from app.llm.provider import get_receipt_extractor
    from main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_receipt_extractor] = lambda: mock_extractor
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


async def _sign_up(client, email: str) -> tuple[dict, dict]:
    resp = await client.post(
        "/api/auth/sign-up", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 201, resp.text
    pair = resp.json()
    return pair, {"Authorization": f"Bearer {pair['access_token']}"}


async def _user_id(db: AsyncSession, email: str) -> uuid.UUID:
    return (await db.execute(select(User.id).where(User.email == email))).scalar_one()


async def _give_user_everything(
    client, db: AsyncSession, headers: dict, user_id: uuid.UUID, image: bytes
) -> uuid.UUID:
    """Create one row in every user-owned table, plus receipt image files.

    Returns the scanned receipt's id.
    """
    scan = await client.post(
        "/api/receipts/scan",
        headers=headers,
        files={"file": ("r.jpg", image, "image/jpeg")},
    )
    assert scan.status_code == 200, scan.text
    receipt_id = uuid.UUID(scan.json()["receipt_id"])

    manual = await client.post(
        "/api/receipts",
        headers=headers,
        json={
            "store_name": "Manual Mart",
            "date": "2026-10-01",
            "total": 5.0,
            "items": [
                {"name": "Apples", "quantity": 1, "unit_price": 5.0, "total_price": 5.0}
            ],
        },
    )
    assert manual.status_code == 201, manual.text
    # A soft-deleted receipt still belongs to the user and must go too.
    manual_id = manual.json()["id"]
    deleted = await client.delete(f"/api/receipts/{manual_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text

    budget = await client.post(
        "/api/budgets",
        headers=headers,
        json={"amount": 400, "period_type": "monthly", "period_start": "2026-10-01"},
    )
    assert budget.status_code == 201, budget.text
    budget_id = uuid.UUID(budget.json()["id"])

    push = await client.post(
        "/api/users/me/push-tokens",
        headers=headers,
        json={"token": f"ExponentPushToken[{user_id}]"},
    )
    assert push.status_code == 204, push.text

    custom = Category(name=f"Custom {user_id}", user_id=user_id)
    db.add(custom)
    await db.flush()
    line_item_id = (
        (await db.execute(select(LineItem.id).where(LineItem.receipt_id == receipt_id)))
        .scalars()
        .first()
    )
    db.add_all(
        [
            BudgetAlertSent(
                budget_id=budget_id,
                period_start=date(2026, 10, 1),
                threshold_percent=80,
            ),
            Notification(user_id=user_id, type="budget_alert", title="t", body="b"),
            UserItemMapping(
                user_id=user_id, raw_text_pattern="APPLS", category_id=custom.id
            ),
            ReceiptCorrection(
                receipt_id=receipt_id,
                line_item_id=line_item_id,
                user_id=user_id,
                field="name",
                original_value="APPLS",
                corrected_value="Apples",
            ),
        ]
    )
    await db.commit()
    return receipt_id


async def _rows_owned_by(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    """Count rows tied to the user in every table, so a new table can't hide."""
    counts: dict[str, int] = {}
    receipt_ids = select(Receipt.id).where(Receipt.user_id == user_id)
    budget_ids = select(Budget.id).where(Budget.user_id == user_id)
    for table in Base.metadata.sorted_tables:
        if "user_id" in table.c:
            where = table.c.user_id == user_id
        elif table.name == "users":
            where = table.c.id == user_id
        elif "receipt_id" in table.c:
            where = table.c.receipt_id.in_(receipt_ids)
        elif "budget_id" in table.c:
            where = table.c.budget_id.in_(budget_ids)
        else:
            continue
        counts[table.name] = (
            await db.execute(select(func.count()).select_from(table).where(where))
        ).scalar_one()
    return counts


def _stored_files(receipt_id: uuid.UUID) -> list[str]:
    base = get_settings().storage_path
    paths = [generate_receipt_path(receipt_id, ext) for ext in RECEIPT_EXTS]
    paths.append(generate_thumbnail_path(receipt_id, ".jpg"))
    return [p for p in paths if os.path.exists(os.path.join(base, p))]


@pytest.mark.asyncio
async def test_delete_account_erases_every_row_and_image(
    api_client, db_session, test_image_bytes
):
    from app.core.seed import seed_default_categories

    await seed_default_categories(db_session)
    _, headers = await _sign_up(api_client, "gone@test.com")
    _, headers_b = await _sign_up(api_client, "stays@test.com")
    user_id = await _user_id(db_session, "gone@test.com")
    user_b = await _user_id(db_session, "stays@test.com")
    receipt_id = await _give_user_everything(
        api_client, db_session, headers, user_id, test_image_bytes
    )
    receipt_b = await _give_user_everything(
        api_client, db_session, headers_b, user_b, test_image_bytes
    )
    before = await _rows_owned_by(db_session, user_id)
    assert all(before.values()), f"setup missed a table: {before}"
    assert _stored_files(receipt_id)
    b_before = await _rows_owned_by(db_session, user_b)

    resp = await api_client.delete("/api/users/me", headers=headers)

    assert resp.status_code == 204, resp.text
    db_session.expire_all()
    after = await _rows_owned_by(db_session, user_id)
    assert after == dict.fromkeys(after, 0)
    assert _stored_files(receipt_id) == []
    # The other account is untouched.
    assert await _rows_owned_by(db_session, user_b) == b_before
    assert _stored_files(receipt_b)


@pytest.mark.asyncio
async def test_delete_account_erases_failed_signins_logged_under_its_email(
    api_client, db_session
):
    # A failed sign-in for an unknown email is logged with no user_id and the
    # email in metadata. Once the account exists, that email is its data.
    await api_client.post(
        "/api/auth/sign-in", json={"email": "gone@test.com", "password": "nope-nope-1"}
    )
    await api_client.post(
        "/api/auth/sign-in", json={"email": "other@test.com", "password": "nope-nope-1"}
    )
    _, headers = await _sign_up(api_client, "gone@test.com")

    resp = await api_client.delete("/api/users/me", headers=headers)

    assert resp.status_code == 204, resp.text
    db_session.expire_all()
    left = (await db_session.execute(select(AuthEvent.event_metadata))).scalars().all()
    emails = [m.get("email") for m in left if m]
    assert "gone@test.com" not in emails
    assert "other@test.com" in emails


@pytest.mark.asyncio
async def test_delete_account_revokes_tokens(api_client, monkeypatch):
    from app.services import auth as auth_service

    denied: list[str] = []
    families: list[str] = []

    async def _add_jti(jti, _ttl):
        denied.append(jti)

    async def _invalidate(fam, ttl_seconds):
        families.append(fam)

    monkeypatch.setattr(auth_service, "add_jti_async", _add_jti)
    monkeypatch.setattr(auth_service, "invalidate_family_async", _invalidate)
    pair, headers = await _sign_up(api_client, "gone@test.com")

    resp = await api_client.delete("/api/users/me", headers=headers)

    assert resp.status_code == 204, resp.text
    assert len(denied) == 1 and len(families) == 1
    # With the Redis denylist stubbed open, the token still fails: its user is gone.
    me = await api_client.get("/api/auth/me", headers=headers)
    assert me.status_code == 401
    refreshed = await api_client.post(
        "/api/auth/refresh", json={"refresh_token": pair["refresh_token"]}
    )
    # /refresh rejects any bad refresh token with 400 invalid_token.
    assert refreshed.status_code == 400
    assert refreshed.json()["detail"]["code"] == "invalid_token"


@pytest.mark.asyncio
async def test_second_delete_call_is_rejected_and_changes_nothing(
    api_client, db_session
):
    _, headers = await _sign_up(api_client, "gone@test.com")
    _, headers_b = await _sign_up(api_client, "stays@test.com")
    user_b = await _user_id(db_session, "stays@test.com")
    first = await api_client.delete("/api/users/me", headers=headers)
    assert first.status_code == 204
    b_before = await _rows_owned_by(db_session, user_b)

    second = await api_client.delete("/api/users/me", headers=headers)

    assert second.status_code == 401
    db_session.expire_all()
    assert await _rows_owned_by(db_session, user_b) == b_before


@pytest.mark.asyncio
async def test_delete_account_requires_auth(api_client):
    resp = await api_client.delete("/api/users/me")
    assert resp.status_code == 401


class _CrashingStorage:
    """Deletes one file, then dies, as a process killed mid-run would."""

    def __init__(self, real: LocalFileStorage) -> None:
        self.real = real
        self.deleted = 0

    async def delete(self, path: str) -> None:
        if self.deleted == 1:
            raise RuntimeError("killed")
        await self.real.delete(path)
        self.deleted += 1


@pytest.mark.asyncio
async def test_rerun_after_crash_halfway_ends_in_the_same_state(
    api_client, db_session, test_image_bytes
):
    from app.core.seed import seed_default_categories

    await seed_default_categories(db_session)
    _, headers = await _sign_up(api_client, "gone@test.com")
    user_id = await _user_id(db_session, "gone@test.com")
    receipt_id = await _give_user_everything(
        api_client, db_session, headers, user_id, test_image_bytes
    )
    storage = LocalFileStorage(get_settings().storage_path)

    with pytest.raises(RuntimeError):
        await account_service.delete_account(
            db_session, user_id, storage=_CrashingStorage(storage)
        )
    await db_session.rollback()
    assert (await _rows_owned_by(db_session, user_id))["users"] == 1

    await account_service.delete_account(db_session, user_id, storage=storage)
    # A third run, with nothing left, is a no-op.
    await account_service.delete_account(db_session, user_id, storage=storage)

    db_session.expire_all()
    after = await _rows_owned_by(db_session, user_id)
    assert after == dict.fromkeys(after, 0)
    assert _stored_files(receipt_id) == []


# ── Sign in with Apple: revoke the grant before deleting (TN3194) ──


@pytest.fixture
def apple_revocations(monkeypatch):
    """Record revoke calls; a test sets `fail` to make the next one raise."""
    from app.services import apple_auth

    state: dict = {"calls": [], "fail": None}

    async def _revoke(*, authorization_code: str, expected_sub: str) -> None:
        state["calls"].append((authorization_code, expected_sub))
        if state["fail"] is not None:
            raise state["fail"]

    monkeypatch.setattr(account_service, "revoke_apple_grant", _revoke)
    state["errors"] = apple_auth
    return state


async def _apple_user(client, db: AsyncSession) -> dict:
    """An account linked to Sign in with Apple."""
    _, headers = await _sign_up(client, "apple@test.com")
    user = (
        await db.execute(select(User).where(User.email == "apple@test.com"))
    ).scalar_one()
    user.apple_subject = "apple-sub-1"
    await db.commit()
    return headers


async def _user_exists(db: AsyncSession, email: str) -> bool:
    db.expire_all()
    found = await db.execute(select(User.id).where(User.email == email))
    return found.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_apple_user_without_code_must_reauthenticate(
    api_client, db_session, apple_revocations
):
    headers = await _apple_user(api_client, db_session)

    resp = await api_client.delete("/api/users/me", headers=headers)

    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "apple_reauth_required"
    assert apple_revocations["calls"] == []
    assert await _user_exists(db_session, "apple@test.com")


@pytest.mark.asyncio
async def test_apple_user_is_revoked_then_deleted(
    api_client, db_session, apple_revocations
):
    headers = await _apple_user(api_client, db_session)

    resp = await api_client.request(
        "DELETE",
        "/api/users/me",
        headers=headers,
        json={"apple_authorization_code": "fresh-code"},
    )

    assert resp.status_code == 204, resp.text
    assert apple_revocations["calls"] == [("fresh-code", "apple-sub-1")]
    assert not await _user_exists(db_session, "apple@test.com")


@pytest.mark.asyncio
async def test_failed_apple_revoke_blocks_deletion(
    api_client, db_session, apple_revocations
):
    headers = await _apple_user(api_client, db_session)
    apple_revocations["fail"] = ValueError("apple revoke failed: 503")

    resp = await api_client.request(
        "DELETE",
        "/api/users/me",
        headers=headers,
        json={"apple_authorization_code": "fresh-code"},
    )

    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"]["code"] == "apple_revoke_failed"
    assert await _user_exists(db_session, "apple@test.com")


@pytest.mark.asyncio
async def test_other_apple_id_blocks_deletion(
    api_client, db_session, apple_revocations
):
    headers = await _apple_user(api_client, db_session)
    apple_revocations["fail"] = apple_revocations["errors"].AppleAccountMismatch(
        "apple sub mismatch"
    )

    resp = await api_client.request(
        "DELETE",
        "/api/users/me",
        headers=headers,
        json={"apple_authorization_code": "someone-elses-code"},
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"]["code"] == "apple_account_mismatch"
    assert await _user_exists(db_session, "apple@test.com")


@pytest.mark.asyncio
async def test_non_apple_user_ignores_apple_code(
    api_client, db_session, apple_revocations
):
    _, headers = await _sign_up(api_client, "plain@test.com")

    resp = await api_client.request(
        "DELETE",
        "/api/users/me",
        headers=headers,
        json={"apple_authorization_code": "stray"},
    )

    assert resp.status_code == 204, resp.text
    assert apple_revocations["calls"] == []
