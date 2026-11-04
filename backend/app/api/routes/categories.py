import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.entitlements import FEATURE_CUSTOM_CATEGORIES, require_premium
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import (
    CategoryCreateRequest,
    CategoryResponse,
    CategoryUpdateRequest,
)
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.category_service import (
    MAX_CUSTOM_CATEGORIES,
    CategoryLimitError,
    CategoryNameTakenError,
    CategoryNotFoundError,
    CategoryService,
)

router = APIRouter(prefix="/api/categories", tags=["categories"])


async def _emit_changed(
    analytics: AnalyticsService, service: CategoryService, user: User, action: str
) -> None:
    """12-analytics.md: custom_category_changed {action, custom_count}."""
    count = await service.custom_count(user.id)
    analytics.emit(
        "custom_category_changed", {"action": action, "custom_count": count}, user.id
    )


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Category not found")


def _name_taken() -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": "category_name_taken",
            "message": "A category with this name already exists.",
        },
    )


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> list[CategoryResponse]:
    """The default categories, then the user's own in the order they were made."""
    categories = await CategoryService(db).list_for_user(user.id)
    return [CategoryResponse.model_validate(cat) for cat in categories]


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(
    body: CategoryCreateRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_CUSTOM_CATEGORIES)),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> CategoryResponse:
    """Add a custom category (BC-05 AC 3): Premium, at most 10 per user."""
    service = CategoryService(db)
    try:
        category = await service.create(user.id, body.name)
    except CategoryLimitError:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "category_limit_reached",
                "limit": MAX_CUSTOM_CATEGORIES,
                "message": (
                    f"You can have up to {MAX_CUSTOM_CATEGORIES} custom categories."
                ),
            },
        ) from None
    except CategoryNameTakenError:
        raise _name_taken() from None
    await _emit_changed(analytics, service, user, "created")
    return CategoryResponse.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def rename_category(
    category_id: uuid.UUID,
    body: CategoryUpdateRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_CUSTOM_CATEGORIES)),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> CategoryResponse:
    """Rename one of the user's custom categories (Premium)."""
    service = CategoryService(db)
    try:
        category = await service.rename(user.id, category_id, body.name)
    except CategoryNotFoundError:
        raise _not_found() from None
    except CategoryNameTakenError:
        raise _name_taken() from None
    await _emit_changed(analytics, service, user, "renamed")
    return CategoryResponse.model_validate(category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> None:
    """Delete a custom category. Not Premium-gated: after Premium lapses the
    user can still remove what they made. Its items move to "Other"."""
    service = CategoryService(db)
    try:
        await service.delete(user.id, category_id)
    except CategoryNotFoundError:
        raise _not_found() from None
    await _emit_changed(analytics, service, user, "deleted")
