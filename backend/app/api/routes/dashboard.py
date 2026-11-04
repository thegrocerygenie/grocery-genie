from enum import IntEnum

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.dependencies import get_db
from app.core.entitlements import (
    FEATURE_TREND_12_MONTHS,
    premium_required,
    user_is_premium,
)
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import DashboardSpendingResponse
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class TrendMonths(IntEnum):
    """Allowed trend lengths; any other ``months`` is a 422."""

    THREE = 3
    TWELVE = 12  # Premium (D2)


@router.get("/spending", response_model=DashboardSpendingResponse)
async def dashboard_spending(
    period: str | None = Query(
        default=None,
        description=(
            "Budget period, e.g. 2026-03. Defaults to the period that holds "
            "today in the user's time zone."
        ),
    ),
    months: TrendMonths = Query(
        default=TrendMonths.THREE,
        description="Trend length in months: 3, or 12 for Premium users.",
    ),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    premium: bool = Depends(user_is_premium),
) -> DashboardSpendingResponse:
    if months is TrendMonths.TWELVE and not premium:
        raise premium_required(FEATURE_TREND_12_MONTHS)
    service = BudgetService(db)
    return await service.get_dashboard_data(
        user.id, period, months=int(months), today=clock.today_in(user.timezone)
    )
