import json
import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select

from app.core.dependencies import get_sync_session_factory
from app.core.money import format_money
from app.models.database import (
    Budget,
    Category,
    LineItem,
    Notification,
    Receipt,
    User,
)
from app.services.budget_service import in_budget_currency, period_containing
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


# BC-06 AC 3: the summary goes out at this hour in the user's time zone.
SUMMARY_LOCAL_HOUR = 9


@celery_app.task(name="app.tasks.summary_tasks.generate_weekly_summaries")
def generate_weekly_summaries() -> None:
    """Send weekly summaries due this hour.

    Beat runs this every hour: each user gets theirs on their chosen day at
    9 AM in their own time zone.
    """
    with get_sync_session_factory()() as db:
        generate_weekly_summaries_at(db, datetime.now(UTC))


def generate_weekly_summaries_at(db, now: datetime) -> None:
    """Send the summaries due at ``now`` (UTC); one transaction."""
    for user_id, today in _summary_recipients(db, now):
        try:
            _generate_summary_for_user(
                db,
                user_id,
                today,
                today - timedelta(days=7),
                today - timedelta(days=14),
            )
        except Exception:
            logger.exception("Failed to generate weekly summary for user %s", user_id)
    db.commit()


def _user_zone(name: str | None) -> ZoneInfo:
    """The user's time zone; UTC for a missing or unknown name."""
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _summary_recipients(db, now: datetime) -> list[tuple]:
    """(user id, their local date) for each user whose summary is due at
    ``now``: opted in, it is 9 AM on their chosen day where they are, and they
    have confirmed spend in the week before."""
    due: list[tuple] = []
    users = db.execute(
        select(User.id, User.timezone, User.weekly_summary_day).where(
            User.weekly_summary_enabled.is_(True)
        )
    ).all()
    for user_id, zone_name, summary_day in users:
        local = now.astimezone(_user_zone(zone_name))
        # weekly_summary_day uses 0 = Sunday; date.weekday() uses 0 = Monday.
        if local.hour != SUMMARY_LOCAL_HOUR or (local.weekday() + 1) % 7 != summary_day:
            continue
        today = local.date()
        spent = db.execute(
            select(Receipt.id)
            .where(
                Receipt.user_id == user_id,
                Receipt.status == "confirmed",
                Receipt.deleted_at.is_(None),
                Receipt.date >= today - timedelta(days=7),
                Receipt.date <= today,
            )
            .limit(1)
        ).first()
        if spent:
            due.append((user_id, today))
    return due


def _generate_summary_for_user(
    db, user_id, today: date, week_start: date, prior_week_start: date
) -> None:
    """Generate and persist a weekly summary for a single user.

    Idempotent per day: a retried or doubled beat run adds nothing. ``today``
    is the user's local date, so the day starts at their local midnight.
    """
    user = db.execute(
        select(User.currency_preference, User.timezone).where(User.id == user_id)
    ).first()
    currency = (user.currency_preference if user else None) or "USD"
    zone = _user_zone(user.timezone if user else None)
    day_start = datetime.combine(today, time.min, tzinfo=zone)
    already_sent = db.execute(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.type == "weekly_summary",
            Notification.created_at >= day_start,
        )
    ).first()
    if already_sent:
        return

    # Current week spending
    current_total = _get_total_spending(db, user_id, week_start, today)
    if current_total == 0:
        return

    # Top category
    top_category = _get_top_category(db, user_id, week_start, today)

    # Prior week spending for comparison
    prior_week_end = week_start - timedelta(days=1)
    prior_total = _get_total_spending(db, user_id, prior_week_start, prior_week_end)

    # Calculate percentage change
    if prior_total > 0:
        percent_change = ((current_total - prior_total) / prior_total) * 100
        direction = "more" if percent_change > 0 else "less"
        comparison = f"You spent {abs(percent_change):.0f}% {direction} than last week."
    else:
        comparison = "No data from last week to compare."

    body = (
        f"This week: {format_money(current_total, currency)}. "
        f"Top category: {top_category}. {comparison}"
    )
    status = _budget_status(db, user_id, today, currency)
    if status:
        body = f"{body} {status}"

    notification = Notification(
        user_id=user_id,
        type="weekly_summary",
        title="Weekly Spending Summary",
        body=body,
        data=json.dumps(
            {
                "total_spend": round(current_total, 2),
                "top_category": top_category,
                "prior_week_total": round(prior_total, 2),
            }
        ),
    )
    db.add(notification)


def _get_total_spending(db, user_id, start: date, end: date) -> float:
    """Sum of all confirmed line item totals in date range."""
    result = db.execute(
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


def _get_top_category(db, user_id, start: date, end: date) -> str:
    """Find the category with the highest spending in date range."""
    result = db.execute(
        select(
            Category.name,
            func.sum(LineItem.total_price).label("total"),
        )
        .join(LineItem, LineItem.category_id == Category.id)
        .join(Receipt, LineItem.receipt_id == Receipt.id)
        .where(
            Receipt.user_id == user_id,
            Receipt.status == "confirmed",
            Receipt.deleted_at.is_(None),
            in_budget_currency(user_id),
            Receipt.date >= start,
            Receipt.date <= end,
        )
        .group_by(Category.name)
        .order_by(func.sum(LineItem.total_price).desc())
        .limit(1)
    )
    row = result.first()
    return row[0] if row else "Other"


def _budget_status(db, user_id, today: date, currency: str) -> str | None:
    """BC-06 AC 1: the overall budget's use in the period holding ``today``,
    or None without an overall budget."""
    budget = db.execute(
        select(Budget)
        .where(
            Budget.user_id == user_id,
            Budget.category_id.is_(None),
            Budget.deleted_at.is_(None),
        )
        .order_by(Budget.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if budget is None or float(budget.amount) <= 0:
        return None
    _, start, end = period_containing(today, budget.period_start.day)
    spent = _get_total_spending(db, user_id, start, min(end, today))
    cap = float(budget.amount)
    if spent > cap:
        return (
            f"Budget: {format_money(spent - cap, currency)} over your "
            f"{format_money(cap, currency)} budget."
        )
    return (
        f"Budget: {format_money(spent, currency)} of {format_money(cap, currency)} "
        f"used ({spent / cap:.0%})."
    )
