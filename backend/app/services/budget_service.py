import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.retention import restore_cutoff
from app.events.types import BudgetThresholdBreached
from app.models.database import (
    Budget,
    BudgetAlertSent,
    Category,
    LineItem,
    Receipt,
    User,
)
from app.models.schemas import (
    BudgetCategorySummary,
    BudgetCreateRequest,
    BudgetOverallSummary,
    BudgetSummaryResponse,
    DashboardCategoryChange,
    DashboardSpendingResponse,
    DashboardTopItem,
    DashboardTrendCategory,
    DashboardTrendMonth,
)


class BudgetConflictError(ValueError):
    """The change would leave two active budgets for one category."""


# Label for line items with no category in the trend split.
UNCATEGORIZED = "Uncategorized"


def previous_period(period: str) -> str:
    """Return the 'YYYY-MM' period one month before ``period``."""
    year, month = int(period[:4]), int(period[5:7])
    if month == 1:
        return f"{year - 1:04d}-12"
    return f"{year:04d}-{month - 1:02d}"


def _period_bounds(year: int, month: int, start_day: int) -> tuple[date, date]:
    """Start and end dates of the period that starts in ``year``-``month``."""
    # Clamp to valid day for this month
    max_day = calendar.monthrange(year, month)[1]
    period_start = date(year, month, min(start_day, max_day))

    # End date is the day before the start of next period
    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1
    next_max_day = calendar.monthrange(next_year, next_month)[1]
    next_clamped_day = min(start_day, next_max_day)
    period_end = date(next_year, next_month, next_clamped_day) - timedelta(days=1)
    return period_start, period_end


def _same_category(category_id: uuid.UUID | None):
    """Match a category, treating None as the overall budget (SQL NULL)."""
    if category_id is None:
        return Budget.category_id.is_(None)
    return Budget.category_id == category_id


class BudgetService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_budget(
        self, user_id: uuid.UUID, request: BudgetCreateRequest
    ) -> Budget:
        """Set the user's budget for a category; see ``save_budget``."""
        budget, _ = await self.save_budget(user_id, request)
        return budget

    async def save_budget(
        self, user_id: uuid.UUID, request: BudgetCreateRequest
    ) -> tuple[Budget, bool]:
        """Set the user's budget for a category (or overall, when None).

        A user has at most one active budget per category, so saving again
        updates the active one instead of adding a duplicate (BC-02 AC 4).
        A soft-deleted budget with the same (category, period start) comes
        back, because the unique constraint still holds its key.
        Returns the budget and whether it is new to the user.
        """
        if request.category_id is not None:
            result = await self.db.execute(
                select(Category).where(Category.id == request.category_id)
            )
            if result.scalar_one_or_none() is None:
                raise ValueError(f"Category {request.category_id} not found")

        period_start = date.fromisoformat(request.period_start)

        active = await self._active_budget(user_id, request.category_id)
        if active is not None:
            active.amount = request.amount
            active.period_type = request.period_type
            if not await self._period_start_taken(active, period_start):
                active.period_start = period_start
            await self.db.flush()
            return active, False

        result = await self.db.execute(
            select(Budget).where(
                Budget.user_id == user_id,
                _same_category(request.category_id),
                Budget.period_start == period_start,
                Budget.deleted_at.is_not(None),
            )
        )
        deleted = result.scalars().first()
        if deleted is not None:
            deleted.deleted_at = None
            deleted.amount = request.amount
            deleted.period_type = request.period_type
            await self.db.flush()
            return deleted, True

        budget = Budget(
            user_id=user_id,
            category_id=request.category_id,
            amount=request.amount,
            period_start=period_start,
            period_type=request.period_type,
        )
        self.db.add(budget)
        await self.db.flush()
        return budget, True

    async def list_budgets(self, user_id: uuid.UUID) -> list[Budget]:
        """The user's active budgets: overall first, then by category."""
        result = await self.db.execute(
            select(Budget)
            .where(Budget.user_id == user_id, Budget.deleted_at.is_(None))
            .order_by(Budget.category_id.is_not(None), Budget.created_at)
        )
        return list(result.scalars().all())

    async def update_budget(
        self,
        budget_id: uuid.UUID,
        user_id: uuid.UUID,
        amount: float,
        period_start: date | None = None,
    ) -> Budget:
        """Update a budget amount and, optionally, its period start.

        Takes effect immediately.
        """
        result = await self.db.execute(
            select(Budget).where(
                Budget.id == budget_id,
                Budget.user_id == user_id,
                Budget.deleted_at.is_(None),
            )
        )
        budget = result.scalar_one_or_none()
        if budget is None:
            raise ValueError(f"Budget {budget_id} not found")
        if period_start is not None and period_start != budget.period_start:
            if await self._period_start_taken(budget, period_start):
                raise BudgetConflictError(
                    "Another budget for this category already uses that start date"
                )
            budget.period_start = period_start
        budget.amount = amount
        await self.db.flush()
        return budget

    async def _active_budget(
        self, user_id: uuid.UUID, category_id: uuid.UUID | None
    ) -> Budget | None:
        result = await self.db.execute(
            select(Budget)
            .where(
                Budget.user_id == user_id,
                _same_category(category_id),
                Budget.deleted_at.is_(None),
            )
            .order_by(Budget.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _period_start_taken(self, budget: Budget, period_start: date) -> bool:
        """True if another row (even a deleted one) holds this unique key."""
        result = await self.db.execute(
            select(Budget.id).where(
                Budget.user_id == budget.user_id,
                _same_category(budget.category_id),
                Budget.period_start == period_start,
                Budget.id != budget.id,
            )
        )
        return result.first() is not None

    async def soft_delete_budget(
        self, budget_id: uuid.UUID, user_id: uuid.UUID
    ) -> Budget:
        from datetime import UTC, datetime

        result = await self.db.execute(
            select(Budget).where(
                Budget.id == budget_id,
                Budget.user_id == user_id,
                Budget.deleted_at.is_(None),
            )
        )
        budget = result.scalar_one_or_none()
        if budget is None:
            raise ValueError(f"Budget {budget_id} not found")
        budget.deleted_at = datetime.now(UTC)
        await self.db.flush()
        return budget

    async def restore_budget(self, budget_id: uuid.UUID, user_id: uuid.UUID) -> Budget:
        from datetime import UTC

        result = await self.db.execute(
            select(Budget).where(
                Budget.id == budget_id,
                Budget.user_id == user_id,
            )
        )
        budget = result.scalar_one_or_none()
        if budget is None:
            raise ValueError(f"Budget {budget_id} not found")
        if budget.deleted_at is None:
            return budget
        deleted_at = budget.deleted_at
        if deleted_at.tzinfo is None:  # SQLite drops the zone
            deleted_at = deleted_at.replace(tzinfo=UTC)
        if deleted_at < restore_cutoff():
            raise ValueError("Budget past 30-day restore window")
        if await self._active_budget(user_id, budget.category_id) is not None:
            raise BudgetConflictError("This category already has an active budget")
        budget.deleted_at = None
        await self.db.flush()
        return budget

    async def list_recently_deleted(self, user_id: uuid.UUID) -> list[Budget]:
        cutoff = restore_cutoff()
        result = await self.db.execute(
            select(Budget)
            .where(
                Budget.user_id == user_id,
                Budget.deleted_at.is_not(None),
                Budget.deleted_at >= cutoff,
            )
            .order_by(Budget.deleted_at.desc())
        )
        return list(result.scalars().all())

    async def get_period_dates(
        self, user_id: uuid.UUID, period: str
    ) -> tuple[date, date]:
        """Resolve 'YYYY-MM' to (start_date, end_date) based on user's budget start day.

        If user has an overall budget, use its period_start day-of-month.
        Otherwise default to 1st of month.
        """
        year, month = int(period[:4]), int(period[5:7])
        return _period_bounds(year, month, await self._start_day(user_id))

    async def get_period_containing(
        self, user_id: uuid.UUID, day: date
    ) -> tuple[str, date, date]:
        """The 'YYYY-MM' period that holds ``day``, with its start and end dates.

        A period is named for the month it starts in. With a start day of 15,
        March 10 falls in the period that began February 15, so it is
        '2026-02', not '2026-03'.
        """
        start_day = await self._start_day(user_id)
        year, month = day.year, day.month
        period_start, period_end = _period_bounds(year, month, start_day)
        if day < period_start:
            year, month = (year - 1, 12) if month == 1 else (year, month - 1)
            period_start, period_end = _period_bounds(year, month, start_day)
        return f"{year:04d}-{month:02d}", period_start, period_end

    async def _start_day(self, user_id: uuid.UUID) -> int:
        """Day of the month the user's budget periods start on."""
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
        return overall_budget.period_start.day if overall_budget else 1

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
                Receipt.deleted_at.is_(None),
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
                Receipt.deleted_at.is_(None),
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
        result = await self.db.execute(
            select(Budget).where(Budget.user_id == user_id, Budget.deleted_at.is_(None))
        )
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
                Receipt.deleted_at.is_(None),
                Receipt.date >= start,
                Receipt.date <= end,
            )
            .group_by(LineItem.raw_name)
            .order_by(func.sum(LineItem.total_price).desc())
            .limit(limit)
        )
        rows = result.all()
        categories = await self._dominant_categories(
            user_id, start, end, [row[0] for row in rows]
        )
        names = await self._get_category_names(
            {cid for cid in categories.values() if cid is not None}
        )
        return [
            DashboardTopItem(
                name=row[0],
                total_spent=round(float(row[1]), 2),
                count=row[2],
                category_id=categories.get(row[0]),
                category_name=names.get(categories.get(row[0])),
            )
            for row in rows
        ]

    async def _dominant_categories(
        self, user_id: uuid.UUID, start: date, end: date, item_names: list[str]
    ) -> dict[str, uuid.UUID | None]:
        """For each item name, the category with the most spend in the period.

        An item can sit in more than one category (a correction, or a store
        that files it differently). Ties go to the category seen with more
        line items, then to a stable order.
        """
        if not item_names:
            return {}
        result = await self.db.execute(
            select(
                LineItem.raw_name,
                LineItem.category_id,
                func.sum(LineItem.total_price),
                func.count(),
            )
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.deleted_at.is_(None),
                Receipt.date >= start,
                Receipt.date <= end,
                LineItem.raw_name.in_(item_names),
            )
            .group_by(LineItem.raw_name, LineItem.category_id)
        )
        best: dict[str, tuple[float, int, str, uuid.UUID | None]] = {}
        for name, category_id, spent, count in result.all():
            key = (float(spent), count, str(category_id or ""), category_id)
            if name not in best or key[:3] > best[name][:3]:
                best[name] = key
        return {name: entry[3] for name, entry in best.items()}

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
            by_category = await self.get_spending_by_category(user_id, p_start, p_end)
            total = sum(by_category.values())
            names = await self._get_category_names(
                {cid for cid in by_category if cid is not None}
            )
            categories = sorted(
                (
                    DashboardTrendCategory(
                        category_id=cid,
                        name=names.get(cid, "Unknown")
                        if cid is not None
                        else UNCATEGORIZED,
                        spent=round(spent, 2),
                    )
                    for cid, spent in by_category.items()
                ),
                key=lambda c: (-c.spent, c.name),
            )

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
                    categories=categories,
                )
            )

        return trend

    async def get_prior_average(
        self, user_id: uuid.UUID, period: str, months: int = 3
    ) -> float:
        """Mean monthly spend over the ``months`` before the trend window.

        The trend covers ``period`` and the ``months - 1`` before it, so the
        prior window is the ``months`` months before that.
        """
        first = period
        for _ in range(months):
            first = previous_period(first)
        last = first
        for _ in range(months - 1):
            first = previous_period(first)
        start, _ = await self.get_period_dates(user_id, first)
        _, end = await self.get_period_dates(user_id, last)
        total = await self.get_total_spending(user_id, start, end)
        return round(total / months, 2)

    async def get_category_changes(
        self, user_id: uuid.UUID, period: str
    ) -> list[DashboardCategoryChange]:
        """Compare each category's spend in ``period`` with the month before.

        Covers every category with spend in either month, largest current spend
        first. Uncategorized spend has no category to compare and is left out.
        """
        start, end = await self.get_period_dates(user_id, period)
        prev_start, prev_end = await self.get_period_dates(
            user_id, previous_period(period)
        )
        current = await self.get_spending_by_category(user_id, start, end)
        previous = await self.get_spending_by_category(user_id, prev_start, prev_end)

        cat_ids = {cid for cid in current.keys() | previous.keys() if cid is not None}
        names = await self._get_category_names(cat_ids)
        changes = [
            DashboardCategoryChange(
                category_id=cid,
                name=names.get(cid, "Unknown"),
                spent=round(current.get(cid, 0.0), 2),
                previous_spent=round(previous.get(cid, 0.0), 2),
            )
            for cid in cat_ids
        ]
        changes.sort(key=lambda c: (-c.spent, -c.previous_spent, c.name))
        return changes

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
        prior_average = await self.get_prior_average(user_id, period)
        category_changes = await self.get_category_changes(user_id, period)
        has_receipts = await self._has_receipts(user_id)

        return DashboardSpendingResponse(
            period=period,
            overall=summary.overall,
            categories=summary.categories,
            top_items=top_items,
            trend=trend,
            prior_average=prior_average,
            previous_period=previous_period(period),
            category_changes=category_changes,
            has_receipts=has_receipts,
        )

    async def _has_receipts(self, user_id: uuid.UUID) -> bool:
        """Whether the user has any receipt outside Recently Deleted."""
        result = await self.db.execute(
            select(Receipt.id)
            .where(Receipt.user_id == user_id, Receipt.deleted_at.is_(None))
            .limit(1)
        )
        return result.first() is not None

    async def check_thresholds(
        self,
        user_id: uuid.UUID,
        *receipt_dates: date,
    ) -> list[BudgetThresholdBreached]:
        """Check all budgets for threshold breaches in the periods that hold
        ``receipt_dates``: a confirmed receipt's date, or each date an edit
        moved spend in.

        Pass every date in one call. Each call locks the user's budget rows
        (below), so a second call in the same transaction could lock a budget
        created between the calls after a concurrent confirm already holds it,
        and deadlock with that confirm.
        """
        # The period that holds each date. Before the start day, that is the
        # period that began last month, not this month's. Only the period that
        # holds today alerts (M5): a past period can no longer be acted on, and
        # may predate the budget. Its spend still shows on the dashboard.
        # Today is the server's (UTC), and the user's local date can be a day
        # either side of it, so the periods holding those days count too.
        today = clock.today()
        current_starts = set()
        for offset in (-1, 0, 1):
            _, start, _ = await self.get_period_containing(
                user_id, today + timedelta(days=offset)
            )
            current_starts.add(start)
        periods: dict[date, date] = {}
        for receipt_date in receipt_dates:
            _, period_start, period_end = await self.get_period_containing(
                user_id, receipt_date
            )
            if period_start in current_starts:
                periods[period_start] = period_end
        if not periods:
            return []

        # Lock all of the user's budgets until the request commits, before the
        # spend read below. Two receipts confirmed at once then take turns: the
        # second waits here, and its spend read sees the first one's receipt.
        # Without the lock each sees only its own receipt, and a threshold
        # their sum crosses never alerts (finding H1, formal/budget_alerts).
        # Lock every budget, since any receipt can move overall and category
        # spend. Lock in id order, so two requests never deadlock.
        result = await self.db.execute(
            select(Budget)
            .where(Budget.user_id == user_id, Budget.deleted_at.is_(None))
            .order_by(Budget.id)
            .with_for_update()
        )
        budgets = list(result.scalars().all())
        if not budgets:
            return []

        # Respect the user's per-threshold notification preferences (BC-03).
        # A threshold only fires if both it is globally configured AND the user
        # has it enabled. Unknown users fall back to all configured thresholds.
        active_thresholds = await self._active_thresholds(user_id)
        if not active_thresholds:
            return []

        breaches: list[BudgetThresholdBreached] = []
        for period_start, period_end in sorted(periods.items()):
            breaches += await self._period_breaches(
                user_id, budgets, active_thresholds, period_start, period_end
            )
        return breaches

    async def _period_breaches(
        self,
        user_id: uuid.UUID,
        budgets: list[Budget],
        active_thresholds: list[int],
        period_start: date,
        period_end: date,
    ) -> list[BudgetThresholdBreached]:
        """Thresholds each budget has reached in one period."""
        days_left = max(0, (period_end - clock.today()).days)
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
                            period_start=period_start,
                        )
                    )
                continue

            if budget.category_id is None:
                current_spend = total_spent
            else:
                current_spend = spending.get(budget.category_id, 0.0)

            percent = current_spend / budget_amount * 100
            remaining = budget_amount - current_spend

            for threshold in active_thresholds:
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
                            period_start=period_start,
                        )
                    )

        return breaches

    async def claim_alert(self, breach: BudgetThresholdBreached) -> bool:
        """Record that this threshold alert is being sent for this period.

        Returns False if it was already sent, so each threshold alerts once
        per budget period. The unique key makes this safe when two receipts
        are confirmed at the same time: only one insert wins.
        """
        dialect = self.db.bind.dialect.name
        insert = pg_insert if dialect == "postgresql" else sqlite_insert
        result = await self.db.execute(
            insert(BudgetAlertSent)
            .values(
                id=uuid.uuid4(),
                budget_id=breach.budget_id,
                period_start=breach.period_start,
                threshold_percent=breach.threshold_percent,
            )
            .on_conflict_do_nothing(
                index_elements=["budget_id", "period_start", "threshold_percent"]
            )
            .returning(BudgetAlertSent.id)
        )
        return result.scalar_one_or_none() is not None

    async def _active_thresholds(self, user_id: uuid.UUID) -> list[int]:
        """Configured alert thresholds the user has not opted out of.

        Maps the user's typed preference columns (notif_threshold_50/80/100)
        onto the globally configured thresholds. A configured threshold with no
        matching preference column (e.g. a custom value) is always included.
        """
        configured = get_settings().budget_alert_thresholds
        user = (
            await self.db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            return list(configured)

        prefs = {
            50: user.notif_threshold_50,
            80: user.notif_threshold_80,
            100: user.notif_threshold_100,
        }
        return [t for t in configured if prefs.get(t, True)]

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
