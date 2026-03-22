"""Tests for notification list and mark-read endpoints."""

import uuid

import pytest

from app.models.database import Notification
from tests.conftest import DEV_USER_ID


@pytest.fixture
async def notifications(db_session):
    """Create test notifications: 2 unread + 1 read."""
    n1 = Notification(
        user_id=DEV_USER_ID,
        type="budget_threshold",
        title="Budget 80%",
        body="$100 remaining",
        read=False,
    )
    n2 = Notification(
        user_id=DEV_USER_ID,
        type="weekly_summary",
        title="Weekly Summary",
        body="You spent $350 this week.",
        read=True,
    )
    n3 = Notification(
        user_id=DEV_USER_ID,
        type="budget_threshold",
        title="Budget 100%",
        body="You exceeded your budget.",
        read=False,
    )
    db_session.add_all([n1, n2, n3])
    await db_session.flush()
    return [n1, n2, n3]


# --- List ---


@pytest.mark.asyncio
async def test_list_notifications_empty(client):
    response = await client.get("/api/notifications")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_list_notifications_ordered(client, notifications):
    """Unread first, then ordered by created_at DESC."""
    response = await client.get("/api/notifications")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    items = data["items"]
    # Unread items come first
    unread = [i for i in items if not i["read"]]
    read = [i for i in items if i["read"]]
    assert len(unread) == 2
    assert len(read) == 1
    # Read items should be at the end
    assert items[-1]["read"] is True


@pytest.mark.asyncio
async def test_list_notifications_pagination(client, notifications):
    response = await client.get("/api/notifications?page=1&per_page=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 3
    assert data["page"] == 1

    response2 = await client.get("/api/notifications?page=2&per_page=2")
    data2 = response2.json()
    assert len(data2["items"]) == 1
    assert data2["page"] == 2


# --- Mark Read ---


@pytest.mark.asyncio
async def test_mark_notification_read(client, notifications):
    unread = notifications[0]
    assert unread.read is False

    response = await client.patch(f"/api/notifications/{unread.id}/read")
    assert response.status_code == 200
    data = response.json()
    assert data["read"] is True
    assert data["id"] == str(unread.id)


@pytest.mark.asyncio
async def test_mark_notification_not_found(client):
    fake_id = uuid.uuid4()
    response = await client.patch(f"/api/notifications/{fake_id}/read")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_mark_notification_user_isolation(client_user_b, notifications):
    """User B cannot mark User A's notification as read."""
    notification = notifications[0]
    response = await client_user_b.patch(f"/api/notifications/{notification.id}/read")
    assert response.status_code == 404
