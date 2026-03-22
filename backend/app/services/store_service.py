from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Store


class StoreService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def find_or_create(self, name: str) -> Store:
        """Look up a store by normalized name, or create it."""
        normalized = name.strip().lower()

        result = await self.db.execute(
            select(Store).where(Store.normalized_name == normalized)
        )
        store = result.scalar_one_or_none()

        if store is None:
            store = Store(name=name.strip(), normalized_name=normalized)
            self.db.add(store)
            await self.db.flush()

        return store
