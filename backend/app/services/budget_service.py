import calendar
import uuid
from bisect import bisect_right
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.entitlements import is_premium
from app.core.retention import restore_cutoff
from app.events.types import BudgetThresholdBreached
from app.models.category_looks import DEFAULT_COLOR, DEFAULT_ICON
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
from app.services.category_service import CategoryService, UnknownCategoryError


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


def period_containing(day: date, start_day: int) -> tuple[str, date, date]:
    """The 'YYYY-MM' period holding ``day`` for periods that start on
    ``start_day``, with its start and end dates. Shared by the weekly summary."""
    year, month = day.year, day.month
    period_start, period_end = _period_bounds(year, month, start_day)
    if day < period_start:
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
        period_start, period_end = _period_bounds(year, month, start_day)
    return f"{year:04d}-{month:02d}", period_start, period_end


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


def in_budget_currency(user_id: uuid.UUID):
    """Only receipts in the user's currency count toward budgets (MVP rule,
    app/core/money.py). A signed-in user always has a row; without one,
    every receipt counts."""
    user_currency = (
        select(User.currency_preference).where(User.id == user_id).scalar_subquery()
    )
    return Receipt.currency == func.coalesce(user_currency, Receipt.currency)


def _rollover_running(budget: Budget) -> bool:
    """Rollover is on and has a run. A $0 budget never carries (EC Budget 2:
    it means "spend nothing", and alerts on any spend)."""
    return (
        bool(budget.rollover_enabled)
        and budget.rollover_start is not None
        and float(budget.amount) > 0
    )


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
        # A default or the user's own custom category, never another's; a
        # custom one cannot be deleted before this budget commits.
        try:
            await CategoryService(self.db).ensure_usable(user_id, [request.category_id])
        except UnknownCategoryError:
            raise ValueError(f"Category {request.category_id} not found") from None

        period_start = date.fromisoformat(request.period_start)

        active = await self._active_budget(user_id, request.category_id)
        if active is not None:
            moves = period_start != active.period_start and not (
                await self._period_start_taken(active, period_start)
            )
            affected = await self._rollover_affected(
                user_id, active, request.amount, period_start if moves else None
            )
            openings = await self._carry_now(user_id, affected)
            active.amount = request.amount
            active.period_type = request.period_type
            if moves:
                active.period_start = period_start
            await self.db.flush()
            await self._restart_rollover(user_id, affected, openings)
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
            # A new budget to the user, so it starts with rollover off, as the
            # app shows a new budget's switch. Restore keeps it; this is not
            # a restore.
            deleted.deleted_at = None
            deleted.amount = request.amount
            deleted.period_type = request.period_type
            deleted.rollover_enabled = False
            deleted.rollover_start = None
            deleted.rollover_opening = 0
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
        moves = period_start is not None and period_start != budget.period_start
        if moves and await self._period_start_taken(budget, period_start):
            raise BudgetConflictError(
                "Another budget for this category already uses that start date"
            )
        affected = await self._rollover_affected(
            user_id, budget, amount, period_start if moves else None
        )
        openings = await self._carry_now(user_id, affected)
        if moves:
            budget.period_start = period_start
        budget.amount = amount
        await self.db.flush()
        await self._restart_rollover(user_id, affected, openings)
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
        budget.deleted_at = clock.now()
        await self.db.flush()
        return budget

    async def restore_budget(self, budget_id: uuid.UUID, user_id: uuid.UUID) -> Budget:
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
        if deleted_at < restore_cutoff(clock.now()):
            raise ValueError("Budget past 30-day restore window")
        if await self._active_budget(user_id, budget.category_id) is not None:
            raise BudgetConflictError("This category already has an active budget")
        budget.deleted_at = None
        await self.db.flush()
        await self._rollover_after_restore(user_id, budget, deleted_at)
        return budget

    # --- Rollover (Premium, V11-P3; BC-FR Budget Management) ---
    #
    # A rollover run starts in the period holding ``rollover_start``, with
    # ``rollover_opening`` carried into it. From there each period's unspent
    # amount (its amount plus what carried into it, minus its spend) carries
    # into the next. Overspend carries nothing: the PRD rolls over "unspent
    # budget". The carry is derived on every read from the budget row and the
    # receipts, so it is deterministic, reading it writes nothing, and a late
    # receipt for an earlier period moves it.
    #
    # A change that would re-score past periods (a new amount, EC Budget 1; a
    # new start day) restarts the run in the current period, carrying what it
    # had reached. A change that voids the old periods (a currency change,
    # EC Budget 4; restoring a budget deleted in an earlier period) restarts
    # it with nothing carried. Premium decides only whether the carry applies
    # (rollover_carries), never what it is, so a lapse pauses it.

    async def set_rollover(
        self, budget_id: uuid.UUID, user_id: uuid.UUID, enabled: bool
    ) -> Budget:
        """Turn rollover on or off. Turning it on again keeps the run.

        A new run starts in the previous period when the budget existed then,
        so last period's unspent amount carries into this one; otherwise it
        starts in this period, and the first carry comes next period.
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
        if enabled and budget.rollover_enabled and budget.rollover_start is not None:
            return budget
        if enabled:
            start_day = await self._start_day(user_id)
            _, current, _ = period_containing(await self._today(user_id), start_day)
            _, previous, _ = period_containing(current - timedelta(days=1), start_day)
            _, first, _ = period_containing(budget.period_start, start_day)
            budget.rollover_start = previous if first <= previous else current
        else:
            budget.rollover_start = None
        budget.rollover_enabled = enabled
        budget.rollover_opening = 0
        await self.db.flush()
        return budget

    async def rollover_carries(
        self, user_id: uuid.UUID, budgets: list[Budget], period_start: date
    ) -> dict[uuid.UUID, float]:
        """What rolls into the period starting ``period_start``, per budget id.

        Empty unless the user is Premium now (D2). A budget without rollover
        has no entry.
        """
        user = await self.db.get(User, user_id)
        if user is None or not is_premium(user):
            return {}
        return await self._carries(user_id, budgets, period_start)

    async def _carries(
        self, user_id: uuid.UUID, budgets: list[Budget], period_start: date
    ) -> dict[uuid.UUID, float]:
        running = [b for b in budgets if _rollover_running(b)]
        if not running:
            return {}
        start_day = await self._start_day(user_id)
        firsts = {
            b.id: period_containing(b.rollover_start, start_day)[1] for b in running
        }
        earliest = min(firsts.values())
        spend = (
            await self._spend_by_period(
                user_id, earliest, period_start - timedelta(days=1), start_day
            )
            if earliest < period_start
            else {}
        )
        carries: dict[uuid.UUID, float] = {}
        for budget in running:
            first = firsts[budget.id]
            if period_start < first:
                carries[budget.id] = 0.0
                continue
            carry = float(budget.rollover_opening or 0)
            start = first
            while start < period_start:
                by_category = spend.get(start, {})
                spent = (
                    sum(by_category.values())
                    if budget.category_id is None
                    else by_category.get(budget.category_id, 0.0)
                )
                carry = round(max(0.0, float(budget.amount) + carry - spent), 2)
                _, _, end = period_containing(start, start_day)
                start = end + timedelta(days=1)
            carries[budget.id] = carry
        return carries

    async def _spend_by_period(
        self, user_id: uuid.UUID, start: date, end: date, start_day: int
    ) -> dict[date, dict[uuid.UUID | None, float]]:
        """Spend from ``start`` to ``end`` by period start, then by category,
        counted as get_spending_by_category counts it."""
        result = await self.db.execute(
            select(Receipt.date, LineItem.category_id, func.sum(LineItem.total_price))
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.deleted_at.is_(None),
                in_budget_currency(user_id),
                Receipt.date >= start,
                Receipt.date <= end,
            )
            .group_by(Receipt.date, LineItem.category_id)
        )
        out: dict[date, dict[uuid.UUID | None, float]] = {}
        for day, category_id, total in result.all():
            _, period_start, _ = period_containing(day, start_day)
            bucket = out.setdefault(period_start, {})
            bucket[category_id] = bucket.get(category_id, 0.0) + float(total)
        return out

    async def _running_budgets(self, user_id: uuid.UUID) -> list[Budget]:
        result = await self.db.execute(
            select(Budget).where(
                Budget.user_id == user_id,
                Budget.deleted_at.is_(None),
                Budget.rollover_enabled.is_(True),
                Budget.rollover_start.is_not(None),
            )
        )
        return list(result.scalars().all())

    async def _timezone(self, user_id: uuid.UUID) -> str | None:
        user = await self.db.get(User, user_id)
        return user.timezone if user is not None else None

    async def _today(self, user_id: uuid.UUID) -> date:
        """Today where the user is: the dashboard's current period is the one
        holding it, so a change near midnight lands in the same period."""
        return clock.today_in(await self._timezone(user_id))

    async def _rollover_affected(
        self,
        user_id: uuid.UUID,
        budget: Budget,
        amount: float,
        new_period_start: date | None,
    ) -> list[Budget]:
        """The runs a change to ``budget`` would re-score: every run when the
        overall budget's start day moves, else this one when its amount does."""
        if budget.category_id is None and new_period_start is not None:
            return await self._running_budgets(user_id)
        running = budget.rollover_enabled and budget.rollover_start is not None
        if running and float(amount) != float(budget.amount):
            return [budget]
        return []

    async def _carry_now(
        self, user_id: uuid.UUID, budgets: list[Budget]
    ) -> dict[uuid.UUID, float]:
        """What has carried into the current period, before a change."""
        if not budgets:
            return {}
        today = await self._today(user_id)
        _, current, _ = await self.get_period_containing(user_id, today)
        return await self._carries(user_id, budgets, current)

    async def _restart_rollover(
        self,
        user_id: uuid.UUID,
        budgets: list[Budget],
        openings: dict[uuid.UUID, float],
    ) -> None:
        """Start each run again in the current period (after the change, which
        can move it), with ``openings`` carried in."""
        if not budgets:
            return
        today = await self._today(user_id)
        _, current, _ = await self.get_period_containing(user_id, today)
        for budget in budgets:
            if budget.rollover_enabled and budget.rollover_start is not None:
                budget.rollover_start = current
                budget.rollover_opening = openings.get(budget.id, 0.0)
        await self.db.flush()

    async def restart_rollovers(self, user_id: uuid.UUID) -> None:
        """Restart every run with nothing carried: the currency changed, and
        amounts are not converted (EC Budget 4)."""
        await self._restart_rollover(user_id, await self._running_budgets(user_id), {})

    async def _rollover_after_restore(
        self, user_id: uuid.UUID, budget: Budget, deleted_at: datetime | None
    ) -> None:
        """Nothing carries from periods a budget spent deleted: restoring one
        deleted in an earlier period restarts its run with nothing carried."""
        if deleted_at is None or not (
            budget.rollover_enabled and budget.rollover_start is not None
        ):
            return
        if deleted_at.tzinfo is None:  # SQLite drops the zone
            deleted_at = deleted_at.replace(tzinfo=UTC)
        zone = await self._timezone(user_id)
        today = clock.today_in(zone)
        deleted_on = deleted_at.astimezone(clock.user_zone(zone)).date()
        _, current, _ = await self.get_period_containing(user_id, today)
        _, deleted_in, _ = await self.get_period_containing(user_id, deleted_on)
        if deleted_in < current:
            await self._restart_rollover(user_id, [budget], {})

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
        return period_containing(day, await self._start_day(user_id))

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
                in_budget_currency(user_id),
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
                in_budget_currency(user_id),
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

        # What rolled into this period (Premium rollover); the limit is the
        # amount plus that.
        carries = await self.rollover_carries(user_id, budgets, period_start)

        # Build overall summary
        overall_budget_amount = 0.0
        overall_rolled = 0.0
        for b in budgets:
            if b.category_id is None:
                overall_rolled = carries.get(b.id, 0.0)
                overall_budget_amount = round(float(b.amount) + overall_rolled, 2)
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
        looks = await self._get_category_looks(cat_ids)

        def look(cat_id: uuid.UUID) -> dict[str, str]:
            color, icon = looks.get(cat_id, (DEFAULT_COLOR, DEFAULT_ICON))
            return {"color": color, "icon": icon}

        # Build per-category summaries
        category_summaries: list[BudgetCategorySummary] = []
        seen_categories: set[uuid.UUID] = set()

        for b in budgets:
            if b.category_id is None:
                continue
            cat_spent = spending.get(b.category_id, 0.0)
            cat_rolled = carries.get(b.id, 0.0)
            cat_limit = round(float(b.amount) + cat_rolled, 2)
            cat_remaining = cat_limit - cat_spent
            cat_percent = (cat_spent / cat_limit * 100) if cat_limit > 0 else 0.0
            category_summaries.append(
                BudgetCategorySummary(
                    category_id=b.category_id,
                    name=category_names.get(b.category_id, "Unknown"),
                    budget=cat_limit,
                    spent=cat_spent,
                    remaining=cat_remaining,
                    percent=round(cat_percent, 1),
                    rolled_over=cat_rolled,
                    **look(b.category_id),
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
                        **look(cat_id),
                    )
                )

        return BudgetSummaryResponse(
            period=period,
            overall=BudgetOverallSummary(
                budget=overall_budget_amount,
                spent=round(total_spent, 2),
                remaining=round(overall_remaining, 2),
                percent=round(overall_percent, 1),
                rolled_over=overall_rolled,
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
                in_budget_currency(user_id),
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
                in_budget_currency(user_id),
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
        self, user_id: uuid.UUID, period: str, months: int | None = 3
    ) -> list[DashboardTrendMonth]:
        """Spending in each of the ``months`` periods ending at ``period``,
        oldest first. ``months=None`` is the Trend screen's "All" (BC-04 AC
        6): every period from the one holding the user's first counted
        receipt, and at least ``period`` itself.

        One query covers the whole window, so a long "All" costs no more round
        trips than three months.
        """
        start_day = await self._start_day(user_id)
        if months is None:
            months = await self._months_since_first_receipt(user_id, period, start_day)
        periods = [period]
        for _ in range(months - 1):
            periods.insert(0, previous_period(periods[0]))
        bounds = [_period_bounds(int(p[:4]), int(p[5:7]), start_day) for p in periods]
        starts = [b[0] for b in bounds]

        # The overall budget line, the same for every month of the trend.
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

        # Spend per day and category over the window, then bucketed into
        # periods here: the same receipts get_spending_by_category counts.
        result = await self.db.execute(
            select(
                Receipt.date,
                LineItem.category_id,
                func.sum(LineItem.total_price),
            )
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.deleted_at.is_(None),
                in_budget_currency(user_id),
                Receipt.date >= bounds[0][0],
                Receipt.date <= bounds[-1][1],
            )
            .group_by(Receipt.date, LineItem.category_id)
        )
        by_period: list[dict[uuid.UUID | None, Decimal]] = [{} for _ in periods]
        for day, category_id, spent in result.all():
            bucket = by_period[bisect_right(starts, day) - 1]
            amount = spent if isinstance(spent, Decimal) else Decimal(str(spent))
            bucket[category_id] = bucket.get(category_id, Decimal(0)) + amount

        names = await self._get_category_names(
            {cid for bucket in by_period for cid in bucket if cid is not None}
        )
        trend: list[DashboardTrendMonth] = []
        for p, by_category in zip(periods, by_period, strict=True):
            categories = sorted(
                (
                    DashboardTrendCategory(
                        category_id=cid,
                        name=names.get(cid, "Unknown")
                        if cid is not None
                        else UNCATEGORIZED,
                        spent=round(float(spent), 2),
                    )
                    for cid, spent in by_category.items()
                ),
                key=lambda c: (-c.spent, c.name),
            )
            trend.append(
                DashboardTrendMonth(
                    period=p,
                    spent=round(float(sum(by_category.values(), Decimal(0))), 2),
                    budget=float(budget.amount) if budget else None,
                    categories=categories,
                )
            )

        return trend

    async def _months_since_first_receipt(
        self, user_id: uuid.UUID, period: str, start_day: int
    ) -> int:
        """How many periods run from the one holding the user's first counted
        receipt (confirmed, not in Recently Deleted, in the budget currency)
        through ``period``; 1 when there is none on or before ``period``."""
        result = await self.db.execute(
            select(func.min(Receipt.date)).where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.deleted_at.is_(None),
                in_budget_currency(user_id),
            )
        )
        first_day = result.scalar_one_or_none()
        if first_day is None:
            return 1
        first, _, _ = period_containing(first_day, start_day)
        count = (int(period[:4]) - int(first[:4])) * 12 + (
            int(period[5:7]) - int(first[5:7])
        )
        return max(count + 1, 1)

    async def get_prior_average(
        self, user_id: uuid.UUID, period: str, months: int | None = 3
    ) -> float:
        """Mean monthly spend over the ``months`` before the trend window.

        The trend covers ``period`` and the ``months - 1`` before it, so the
        prior window is the ``months`` months before that. "All"
        (``months=None``) starts at the first receipt, so nothing is before it.
        """
        if months is None:
            return 0.0
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
        self,
        user_id: uuid.UUID,
        period: str | None = None,
        months: int | None = 3,
        today: date | None = None,
    ) -> DashboardSpendingResponse:
        """Get complete dashboard data in a single call.

        Without ``period``, the period that holds ``today`` (the user's local
        date; the server's when not given). With a reset day of 15, October 10
        is in '2026-09', the period that began September 15.

        ``months`` sets the trend length (1, 3, 6 or 12; None for every month
        since the first receipt) and the prior window ``prior_average``
        covers; the rest is about ``period`` alone. ``current_period`` is the
        period holding ``today``, whichever ``period`` was asked for.
        """
        current_period, _, _ = await self.get_period_containing(
            user_id, today or clock.today()
        )
        if period is None:
            period = current_period
        period_start, period_end = await self.get_period_dates(user_id, period)

        summary = await self.get_budget_summary(user_id, period)
        top_items = await self.get_top_items(user_id, period_start, period_end)
        trend = await self.get_spending_trend(user_id, period, months)
        prior_average = await self.get_prior_average(user_id, period, months)
        category_changes = await self.get_category_changes(user_id, period)
        has_receipts = await self._has_receipts(user_id)

        return DashboardSpendingResponse(
            period=period,
            period_start=period_start,
            period_end=period_end,
            overall=summary.overall,
            categories=summary.categories,
            top_items=top_items,
            trend=trend,
            prior_average=prior_average,
            previous_period=previous_period(period),
            category_changes=category_changes,
            has_receipts=has_receipts,
            current_period=current_period,
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
        current: dict[date, date] = {}
        for offset in (-1, 0, 1):
            _, start, end = await self.get_period_containing(
                user_id, today + timedelta(days=offset)
            )
            current[start] = end
        periods: dict[date, date] = {}
        earliest_past: date | None = None
        for receipt_date in receipt_dates:
            _, period_start, period_end = await self.get_period_containing(
                user_id, receipt_date
            )
            if period_start in current:
                periods[period_start] = period_end
            elif period_start < max(current) and (
                earliest_past is None or period_start < earliest_past
            ):
                earliest_past = period_start
        # Spend in an earlier period alerts nowhere (M5), unless rollover
        # carries that period into the current one: then it shrinks the
        # current limit, and can reach a threshold there (V11-P3).
        if not periods and (
            earliest_past is None or not await self._running_budgets(user_id)
        ):
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

        # Under the lock: an earlier period's spend reaches every current
        # period after it while a rollover run covers it. Checking a period
        # the carry does not reach claims nothing new.
        if earliest_past is not None and any(_rollover_running(b) for b in budgets):
            for start, end in current.items():
                if start > earliest_past:
                    periods[start] = end
        if not periods:
            return []

        # BC-03 AC 4: a muted category's budget sends no alert. Filtered after
        # the lock, so every budget stays locked as above.
        muted = await self._muted_alert_categories(user_id)
        budgets = [b for b in budgets if str(b.category_id) not in muted]
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
        # Each limit is the amount plus what rolled into this period, read
        # under the same budget lock as the spend (Premium rollover).
        carries = await self.rollover_carries(user_id, budgets, period_start)

        breaches: list[BudgetThresholdBreached] = []

        for budget in budgets:
            budget_amount = round(float(budget.amount) + carries.get(budget.id, 0.0), 2)
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
                            category_id=budget.category_id,
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
                            category_id=budget.category_id,
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

    async def _muted_alert_categories(self, user_id: uuid.UUID) -> set[str]:
        """Category ids the user turned alerts off for (users.preferences)."""
        prefs = (
            await self.db.execute(select(User.preferences).where(User.id == user_id))
        ).scalar_one_or_none()
        return set((prefs or {}).get("muted_alert_categories", []))

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

    async def _get_category_looks(
        self, category_ids: set[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[str, str]]:
        """Look up each category's (colour, icon) by ID (BC-05 AC 7)."""
        if not category_ids:
            return {}
        result = await self.db.execute(
            select(Category.id, Category.color, Category.icon).where(
                Category.id.in_(category_ids)
            )
        )
        return {row[0]: (row[1], row[2]) for row in result.all()}
