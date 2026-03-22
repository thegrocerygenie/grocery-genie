from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import DashboardSpendingResponse
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/spending", response_model=DashboardSpendingResponse)
async def dashboard_spending(
    period: str | None = Query(
        default=None,
        description="Budget period, e.g. 2026-03. Defaults to current month.",
    ),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardSpendingResponse:
    service = BudgetService(db)
    return await service.get_dashboard_data(user.id, period)
