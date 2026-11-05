from enum import StrEnum

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


class TrendMonths(StrEnum):
    """The Trend screen's range chips (BC-04 AC 6); any other ``months`` is a
    422. Over 3 months is Premium (D2, D11); ``all`` starts at the user's
    first receipt."""

    ONE = "1"
    THREE = "3"
    SIX = "6"  # Premium
    TWELVE = "12"  # Premium
    ALL = "all"  # Premium


FREE_TREND_MONTHS = {TrendMonths.ONE, TrendMonths.THREE}


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
        description=(
            "Trend length in months: 1 or 3, or for Premium users 6, 12, or "
            "all (every month since the first receipt)."
        ),
    ),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    premium: bool = Depends(user_is_premium),
) -> DashboardSpendingResponse:
    # The server decides, never the app (D11): every range over 3 months is
    # Premium, under the 12-month trend's feature id the app already knows.
    if months not in FREE_TREND_MONTHS and not premium:
        raise premium_required(FEATURE_TREND_12_MONTHS)
    service = BudgetService(db)
    return await service.get_dashboard_data(
        user.id,
        period,
        months=None if months is TrendMonths.ALL else int(months),
        today=clock.today_in(user.timezone),
    )
