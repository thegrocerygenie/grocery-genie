import json
import logging
from datetime import date, timedelta

from sqlalchemy import func, select

from app.core.dependencies import get_sync_session_factory
from app.models.database import Category, LineItem, Notification, Receipt
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.summary_tasks.generate_weekly_summaries")
def generate_weekly_summaries() -> None:
    """Generate weekly spending summaries for all users with recent receipts."""
    today = date.today()
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    sync_session_factory = get_sync_session_factory()
    with sync_session_factory() as db:
        # Find users with confirmed receipts in the past 7 days
        user_ids = (
            db.execute(
                select(Receipt.user_id)
                .where(
                    Receipt.status == "confirmed",
                    Receipt.date >= week_start,
                    Receipt.date <= today,
                )
                .distinct()
            )
            .scalars()
            .all()
        )

        for user_id in user_ids:
            try:
                _generate_summary_for_user(
                    db, user_id, today, week_start, prior_week_start
                )
            except Exception:
                logger.exception(
                    "Failed to generate weekly summary for user %s", user_id
                )

        db.commit()


def _generate_summary_for_user(
    db, user_id, today: date, week_start: date, prior_week_start: date
) -> None:
    """Generate and persist a weekly summary for a single user."""
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
        f"This week: ${current_total:.2f}. Top category: {top_category}. {comparison}"
    )

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
            Receipt.date >= start,
            Receipt.date <= end,
        )
        .group_by(Category.name)
        .order_by(func.sum(LineItem.total_price).desc())
        .limit(1)
    )
    row = result.first()
    return row[0] if row else "Other"
