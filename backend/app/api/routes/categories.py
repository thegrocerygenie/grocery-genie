from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import Category, User
from app.models.schemas import CategoryResponse

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CategoryResponse]:
    """Return all default categories plus any user-created categories."""
    result = await db.execute(
        select(Category)
        .where((Category.is_default.is_(True)) | (Category.user_id == user.id))
        .order_by(Category.sort_order)
    )
    categories = result.scalars().all()
    return [CategoryResponse.model_validate(cat) for cat in categories]
