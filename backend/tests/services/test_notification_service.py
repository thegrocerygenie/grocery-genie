import json
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.notification_service import NotificationService


@pytest.fixture
def user_id() -> uuid.UUID:
    return uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def service(db_session: AsyncSession) -> NotificationService:
    return NotificationService(db_session)


@pytest.mark.asyncio
async def test_create_notification(service, user_id, db_session):
    notification = await service.create_notification(
        user_id=user_id,
        type="budget_threshold",
        title="Budget 80% Reached",
        body="$100.00 remaining with 10 days left.",
        data={"budget_id": "test-id", "threshold": 80},
    )
    assert notification.user_id == user_id
    assert notification.type == "budget_threshold"
    assert notification.title == "Budget 80% Reached"
    assert notification.read is False
    parsed_data = json.loads(notification.data)
    assert parsed_data["threshold"] == 80


@pytest.mark.asyncio
async def test_create_notification_no_data(service, user_id, db_session):
    notification = await service.create_notification(
        user_id=user_id,
        type="weekly_summary",
        title="Weekly Summary",
        body="You spent $50 this week.",
    )
    assert notification.data is None


@pytest.mark.asyncio
async def test_create_notification_read_defaults_false(service, user_id, db_session):
    notification = await service.create_notification(
        user_id=user_id,
        type="budget_threshold",
        title="Test",
        body="Test body",
    )
    assert notification.read is False
