from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Category

DEFAULT_CATEGORIES = [
    {"name": "Groceries", "sort_order": 1},
    {"name": "Household", "sort_order": 2},
    {"name": "Personal Care", "sort_order": 3},
    {"name": "Beverages", "sort_order": 4},
    {"name": "Snacks & Treats", "sort_order": 5},
    {"name": "Baby & Kids", "sort_order": 6},
    {"name": "Pet", "sort_order": 7},
    {"name": "Other", "sort_order": 8},
]


async def seed_default_categories(db: AsyncSession) -> None:
    """Insert default categories if they don't already exist."""
    result = await db.execute(select(Category).where(Category.is_default.is_(True)))
    existing = result.scalars().all()
    if existing:
        return

    for cat_data in DEFAULT_CATEGORIES:
        category = Category(
            name=cat_data["name"],
            sort_order=cat_data["sort_order"],
            is_default=True,
            user_id=None,
        )
        db.add(category)
    await db.commit()
