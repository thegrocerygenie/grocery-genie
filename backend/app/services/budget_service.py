import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.events.types import BudgetThresholdBreached
from app.models.database import Budget, Category, LineItem, Receipt
from app.models.schemas import (
    BudgetCategorySummary,
    BudgetCreateRequest,
    BudgetOverallSummary,
    BudgetSummaryResponse,
    DashboardSpendingResponse,
    DashboardTopItem,
    DashboardTrendMonth,
)

DEFAULT_THRESHOLDS = [80, 100]


class BudgetService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_budget(
        self, user_id: uuid.UUID, request: BudgetCreateRequest
    ) -> Budget:
        """Create a new budget for a user."""
        # Validate category exists if provided
        if request.category_id is not None:
            result = await self.db.execute(
                select(Category).where(Category.id == request.category_id)
            )
            if result.scalar_one_or_none() is None:
                raise ValueError(f"Category {request.category_id} not found")

        period_start = date.fromisoformat(request.period_start)

        budget = Budget(
            user_id=user_id,
            category_id=request.category_id,
            amount=request.amount,
            period_start=period_start,
            period_type=request.period_type,
        )
        self.db.add(budget)
        await self.db.flush()
        return budget

    async def update_budget(
        self, budget_id: uuid.UUID, user_id: uuid.UUID, amount: float
    ) -> Budget:
        """Update a budget amount. Takes effect immediately."""
        result = await self.db.execute(
            select(Budget).where(
                Budget.id == budget_id,
                Budget.user_id == user_id,
            )
        )
        budget = result.scalar_one_or_none()
        if budget is None:
            raise ValueError(f"Budget {budget_id} not found")
        budget.amount = amount
        await self.db.flush()
        return budget

    async def get_period_dates(
        self, user_id: uuid.UUID, period: str
    ) -> tuple[date, date]:
        """Resolve 'YYYY-MM' to (start_date, end_date) based on user's budget start day.

        If user has an overall budget, use its period_start day-of-month.
        Otherwise default to 1st of month.
        """
        year, month = int(period[:4]), int(period[5:7])

        # Find user's overall budget to get their preferred start day
        result = await self.db.execute(
            select(Budget)
            .where(
                Budget.user_id == user_id,
                Budget.category_id.is_(None),
            )
            .order_by(Budget.created_at.desc())
            .limit(1)
        )
        overall_budget = result.scalar_one_or_none()

        start_day = overall_budget.period_start.day if overall_budget else 1

        # Clamp to valid day for this month
        max_day = calendar.monthrange(year, month)[1]
        clamped_day = min(start_day, max_day)
        period_start = date(year, month, clamped_day)

        # End date is the day before the start of next period
        if month == 12:
            next_year, next_month = year + 1, 1
        else:
            next_year, next_month = year, month + 1
        next_max_day = calendar.monthrange(next_year, next_month)[1]
        next_clamped_day = min(start_day, next_max_day)
        period_end = date(next_year, next_month, next_clamped_day) - timedelta(days=1)

        return period_start, period_end

    async def get_spending_by_category(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> dict[uuid.UUID | None, float]:
        """Get total spending grouped by category for confirmed receipts
        in date range."""
        result = await self.db.execute(
            select(
                LineItem.category_id,
                func.sum(LineItem.total_price),
            )
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.date >= start,
                Receipt.date <= end,
            )
            .group_by(LineItem.category_id)
        )
        return {row[0]: float(row[1]) for row in result.all()}

    async def get_total_spending(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> float:
        """Get total spending across all categories for confirmed
        receipts in date range."""
        result = await self.db.execute(
            select(func.sum(LineItem.total_price))
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.date >= start,
                Receipt.date <= end,
            )
        )
        total = result.scalar()
        return float(total) if total else 0.0

    async def get_budget_summary(
        self, user_id: uuid.UUID, period: str
    ) -> BudgetSummaryResponse:
        """Get budget vs. actual spending for a given period."""
        period_start, period_end = await self.get_period_dates(user_id, period)

        # Get all budgets for this user
        result = await self.db.execute(select(Budget).where(Budget.user_id == user_id))
        budgets = list(result.scalars().all())

        # Get spending by category
        spending = await self.get_spending_by_category(
            user_id, period_start, period_end
        )

        # Build overall summary
        overall_budget_amount = 0.0
        for b in budgets:
            if b.category_id is None:
                overall_budget_amount = float(b.amount)
                break

        total_spent = sum(spending.values())
        overall_remaining = overall_budget_amount - total_spent
        if overall_budget_amount > 0:
            overall_percent = total_spent / overall_budget_amount * 100
        else:
            overall_percent = 0.0

        # Get categories for name lookup
        cat_ids = {b.category_id for b in budgets if b.category_id is not None}
        cat_ids.update(cid for cid in spending if cid is not None)
        category_names = await self._get_category_names(cat_ids)

        # Build per-category summaries
        category_summaries: list[BudgetCategorySummary] = []
        seen_categories: set[uuid.UUID] = set()

        for b in budgets:
            if b.category_id is None:
                continue
            cat_spent = spending.get(b.category_id, 0.0)
            cat_remaining = float(b.amount) - cat_spent
            cat_percent = (
                (cat_spent / float(b.amount) * 100) if float(b.amount) > 0 else 0.0
            )
            category_summaries.append(
                BudgetCategorySummary(
                    category_id=b.category_id,
                    name=category_names.get(b.category_id, "Unknown"),
                    budget=float(b.amount),
                    spent=cat_spent,
                    remaining=cat_remaining,
                    percent=round(cat_percent, 1),
                )
            )
            seen_categories.add(b.category_id)

        # Include categories with spending but no budget
        for cat_id, cat_spent in spending.items():
            if cat_id is not None and cat_id not in seen_categories:
                category_summaries.append(
                    BudgetCategorySummary(
                        category_id=cat_id,
                        name=category_names.get(cat_id, "Unknown"),
                        budget=0.0,
                        spent=cat_spent,
                        remaining=-cat_spent,
                        percent=0.0,
                    )
                )

        return BudgetSummaryResponse(
            period=period,
            overall=BudgetOverallSummary(
                budget=overall_budget_amount,
                spent=round(total_spent, 2),
                remaining=round(overall_remaining, 2),
                percent=round(overall_percent, 1),
            ),
            categories=category_summaries,
        )

    async def get_top_items(
        self, user_id: uuid.UUID, start: date, end: date, limit: int = 10
    ) -> list[DashboardTopItem]:
        """Get top items by total spend in the given period."""
        result = await self.db.execute(
            select(
                LineItem.raw_name,
                func.sum(LineItem.total_price),
                func.count(),
            )
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.date >= start,
                Receipt.date <= end,
            )
            .group_by(LineItem.raw_name)
            .order_by(func.sum(LineItem.total_price).desc())
            .limit(limit)
        )
        return [
            DashboardTopItem(
                name=row[0],
                total_spent=round(float(row[1]), 2),
                count=row[2],
            )
            for row in result.all()
        ]

    async def get_spending_trend(
        self, user_id: uuid.UUID, period: str, months: int = 3
    ) -> list[DashboardTrendMonth]:
        """Get spending trend for the specified number of months ending at period."""
        year, month = int(period[:4]), int(period[5:7])
        trend: list[DashboardTrendMonth] = []

        for i in range(months - 1, -1, -1):
            # Calculate the month offset
            m = month - i
            y = year
            while m <= 0:
                m += 12
                y -= 1
            p = f"{y:04d}-{m:02d}"
            p_start, p_end = await self.get_period_dates(user_id, p)
            total = await self.get_total_spending(user_id, p_start, p_end)

            # Get budget for this period
            result = await self.db.execute(
                select(Budget)
                .where(
                    Budget.user_id == user_id,
                    Budget.category_id.is_(None),
                )
                .order_by(Budget.created_at.desc())
                .limit(1)
            )
            budget = result.scalar_one_or_none()

            trend.append(
                DashboardTrendMonth(
                    period=p,
                    spent=round(total, 2),
                    budget=float(budget.amount) if budget else None,
                )
            )

        return trend

    async def get_dashboard_data(
        self, user_id: uuid.UUID, period: str | None = None
    ) -> DashboardSpendingResponse:
        """Get complete dashboard data in a single call."""
        if period is None:
            today = date.today()
            period = f"{today.year:04d}-{today.month:02d}"

        summary = await self.get_budget_summary(user_id, period)
        period_start, period_end = await self.get_period_dates(user_id, period)
        top_items = await self.get_top_items(user_id, period_start, period_end)
        trend = await self.get_spending_trend(user_id, period)

        return DashboardSpendingResponse(
            period=period,
            overall=summary.overall,
            categories=summary.categories,
            top_items=top_items,
            trend=trend,
        )

    async def check_thresholds(
        self,
        user_id: uuid.UUID,
        receipt_date: date,
    ) -> list[BudgetThresholdBreached]:
        """Check all budgets for threshold breaches after a receipt confirmation."""
        # Determine the period for this receipt
        today = date.today()
        period = f"{receipt_date.year:04d}-{receipt_date.month:02d}"
        period_start, period_end = await self.get_period_dates(user_id, period)
        days_left = max(0, (period_end - today).days)

        # Get all budgets
        result = await self.db.execute(select(Budget).where(Budget.user_id == user_id))
        budgets = list(result.scalars().all())
        if not budgets:
            return []

        # Get spending
        spending = await self.get_spending_by_category(
            user_id, period_start, period_end
        )
        total_spent = sum(spending.values())

        breaches: list[BudgetThresholdBreached] = []

        for budget in budgets:
            budget_amount = float(budget.amount)
            if budget_amount < 0:
                continue
            if budget_amount == 0:
                if budget.category_id is None:
                    current_spend = total_spent
                else:
                    current_spend = spending.get(budget.category_id, 0.0)
                if current_spend > 0:
                    breaches.append(
                        BudgetThresholdBreached(
                            user_id=user_id,
                            budget_id=budget.id,
                            threshold_percent=100,
                            current_spend=round(current_spend, 2),
                            budget_amount=0,
                            remaining_amount=round(-current_spend, 2),
                            days_left_in_period=days_left,
                        )
                    )
                continue

            if budget.category_id is None:
                current_spend = total_spent
            else:
                current_spend = spending.get(budget.category_id, 0.0)

            percent = current_spend / budget_amount * 100
            remaining = budget_amount - current_spend

            for threshold in DEFAULT_THRESHOLDS:
                if percent >= threshold:
                    breaches.append(
                        BudgetThresholdBreached(
                            user_id=user_id,
                            budget_id=budget.id,
                            threshold_percent=threshold,
                            current_spend=round(current_spend, 2),
                            budget_amount=budget_amount,
                            remaining_amount=round(remaining, 2),
                            days_left_in_period=days_left,
                        )
                    )

        return breaches

    async def _get_category_names(
        self, category_ids: set[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        """Look up category names by IDs."""
        if not category_ids:
            return {}
        result = await self.db.execute(
            select(Category).where(Category.id.in_(category_ids))
        )
        return {cat.id: cat.name for cat in result.scalars().all()}
