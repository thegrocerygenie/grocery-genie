import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import (
    BudgetCreateRequest,
    BudgetResponse,
    BudgetSummaryResponse,
    BudgetUpdateRequest,
    DeletedItemResponse,
)
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.post("", response_model=BudgetResponse, status_code=201)
async def create_budget(
    budget: BudgetCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> BudgetResponse:
    service = BudgetService(db)
    try:
        result = await service.create_budget(user.id, budget)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    budget_type = "overall" if budget.category_id is None else "category"
    analytics.emit(
        "budget_created",
        {"type": budget_type, "amount": budget.amount},
        user.id,
    )
    return BudgetResponse.model_validate(result)


@router.get("/summary", response_model=BudgetSummaryResponse)
async def budget_summary(
    period: str = Query(..., description="Budget period, e.g. 2026-03"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BudgetSummaryResponse:
    service = BudgetService(db)
    return await service.get_budget_summary(user.id, period)


@router.patch("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: str,
    updates: BudgetUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BudgetResponse:
    service = BudgetService(db)
    try:
        result = await service.update_budget(
            uuid.UUID(budget_id), user.id, updates.amount
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="Budget not found") from None
        raise HTTPException(status_code=400, detail=str(e)) from e
    return BudgetResponse.model_validate(result)


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    service = BudgetService(db)
    try:
        await service.soft_delete_budget(uuid.UUID(budget_id), user.id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Budget not found") from None


@router.post("/{budget_id}/restore", response_model=BudgetResponse)
async def restore_budget(
    budget_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BudgetResponse:
    service = BudgetService(db)
    try:
        budget = await service.restore_budget(uuid.UUID(budget_id), user.id)
    except ValueError as e:
        if "past 30-day" in str(e):
            raise HTTPException(status_code=410, detail=str(e)) from e
        raise HTTPException(status_code=404, detail="Budget not found") from None
    return BudgetResponse.model_validate(budget)


@router.get("/recently-deleted", response_model=list[DeletedItemResponse])
async def recently_deleted(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DeletedItemResponse]:
    from datetime import UTC, datetime

    service = BudgetService(db)
    budgets = await service.list_recently_deleted(user.id)
    now = datetime.now(UTC)
    out: list[DeletedItemResponse] = []
    for b in budgets:
        if b.deleted_at is None:
            continue
        days_left = max(0, 30 - (now - b.deleted_at).days)
        scope = "Overall" if b.category_id is None else "Category"
        amount = f"${float(b.amount):.0f}"
        out.append(
            DeletedItemResponse(
                id=b.id,
                deleted_at=b.deleted_at,
                days_remaining=days_left,
                label=f"{scope} budget · {amount}",
                type="budget",
            )
        )
    return out
