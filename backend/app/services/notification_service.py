import json
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Notification


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_notification(
        self,
        user_id: uuid.UUID,
        type: str,
        title: str,
        body: str,
        data: dict | None = None,
    ) -> Notification:
        """Persist a notification record."""
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            data=json.dumps(data) if data else None,
        )
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def list_notifications(
        self,
        user_id: uuid.UUID,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[Notification], int]:
        """List notifications for a user, unread first, then by date DESC."""
        query = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.read.asc(), Notification.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await self.db.execute(query)
        notifications = list(result.scalars().all())

        count_result = await self.db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id)
        )
        total = count_result.scalar() or 0

        return notifications, total

    async def mark_read(
        self,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Notification:
        """Mark a notification as read. Raises ValueError if not found or wrong user."""
        result = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notification = result.scalar_one_or_none()
        if notification is None:
            raise ValueError(f"Notification {notification_id} not found")
        notification.read = True
        await self.db.flush()
        return notification
