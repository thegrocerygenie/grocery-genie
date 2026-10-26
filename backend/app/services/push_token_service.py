import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import PushToken


class PushTokenService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(self, user_id: uuid.UUID, token: str) -> None:
        """Attach a device token to the user. Idempotent; moves it from any
        other account that held it."""
        result = await self.db.execute(
            select(PushToken).where(PushToken.token == token)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            self.db.add(PushToken(user_id=user_id, token=token))
        elif existing.user_id != user_id:
            existing.user_id = user_id
        await self.db.flush()

    async def unregister(self, user_id: uuid.UUID, token: str) -> None:
        """Remove the user's device token. Never touches another user's token."""
        await self.db.execute(
            delete(PushToken).where(
                PushToken.user_id == user_id, PushToken.token == token
            )
        )
        await self.db.flush()
