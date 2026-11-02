"""Tests for weekly summary generation task."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.database import Base, Category, LineItem, Notification, Receipt, User
from app.tasks.summary_tasks import _generate_summary_for_user

TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def sync_db():
    """Synchronous SQLite in-memory DB for testing Celery tasks."""
    engine = create_engine("sqlite://", echo=False)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def user(sync_db):
    user = User(id=TEST_USER_ID, email="test@test.com", name="Test")
    sync_db.add(user)
    sync_db.commit()
    return user


@pytest.fixture
def category(sync_db, user):
    cat = Category(id=uuid.uuid4(), name="Groceries", is_default=True, sort_order=0)
    sync_db.add(cat)
    sync_db.commit()
    return cat


def _create_receipt_with_items(
    db, user_id, receipt_date, items_data, category_id=None, currency="USD"
):
    """Helper: create a confirmed receipt with line items."""
    receipt = Receipt(
        user_id=user_id,
        date=receipt_date,
        status="confirmed",
        currency=currency,
        total=sum(item[1] for item in items_data),
    )
    db.add(receipt)
    db.flush()
    for name, price in items_data:
        li = LineItem(
            receipt_id=receipt.id,
            raw_name=name,
            quantity=1,
            unit_price=price,
            total_price=price,
            category_id=category_id,
        )
        db.add(li)
    db.commit()
    return receipt


def test_summary_includes_total_spend(sync_db, user, category):
    """Summary body includes correct total spend."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    _create_receipt_with_items(
        sync_db,
        TEST_USER_ID,
        date(2026, 3, 18),
        [("Milk", 4.50), ("Bread", 3.00)],
        category.id,
    )
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Eggs", 5.00)], category.id
    )

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(
            Notification.user_id == TEST_USER_ID,
            Notification.type == "weekly_summary",
        )
    )
    notification = result.scalar_one()
    assert "$12.50" in notification.body


def test_summary_includes_top_category(sync_db, user, category):
    """Summary includes the top spending category."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 18), [("Milk", 10.00)], category.id
    )

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    )
    notification = result.scalar_one()
    assert "Groceries" in notification.body


def test_summary_comparison_more(sync_db, user, category):
    """Summary says 'more' when current > prior week."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    # Prior week: $50
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 10), [("Prior", 50.00)], category.id
    )
    # Current week: $100
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Current", 100.00)], category.id
    )

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    )
    notification = result.scalar_one()
    assert "more" in notification.body.lower()
    assert "100%" in notification.body


def test_summary_comparison_less(sync_db, user, category):
    """Summary says 'less' when current < prior week."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    # Prior week: $100
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 10), [("Prior", 100.00)], category.id
    )
    # Current week: $50
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Current", 50.00)], category.id
    )

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    )
    notification = result.scalar_one()
    assert "less" in notification.body.lower()
    assert "50%" in notification.body


def test_summary_no_prior_data(sync_db, user, category):
    """No prior week data shows appropriate message."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    # Only current week spending
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Item", 25.00)], category.id
    )

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    )
    notification = result.scalar_one()
    assert "no data from last week" in notification.body.lower()


def test_summary_skips_zero_spend(sync_db, user):
    """No notification created for users with zero current-week spending."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    )
    assert result.scalar_one_or_none() is None


def test_notification_persisted(sync_db, user, category):
    """Summary creates a proper Notification record."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Item", 30.00)], category.id
    )

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    result = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    )
    notification = result.scalar_one()
    assert notification.user_id == TEST_USER_ID
    assert notification.type == "weekly_summary"
    assert notification.title == "Weekly Spending Summary"
    assert notification.read is False
    assert notification.data is not None


def test_summary_excludes_soft_deleted_receipts(sync_db, user, category):
    """A deleted receipt must not count toward the weekly total."""
    today = date(2026, 3, 22)
    week_start = today - timedelta(days=7)
    prior_week_start = today - timedelta(days=14)

    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 18), [("Milk", 4.50)], category.id
    )
    deleted = _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 19), [("Steak", 40.00)], category.id
    )
    deleted.deleted_at = datetime.now(UTC)
    sync_db.commit()

    _generate_summary_for_user(
        sync_db, TEST_USER_ID, today, week_start, prior_week_start
    )
    sync_db.flush()

    notification = sync_db.execute(
        select(Notification).where(Notification.type == "weekly_summary")
    ).scalar_one()
    assert "$4.50" in notification.body


# 2026-03-22 is a Sunday, 2026-03-25 a Wednesday. weekly_summary_day uses
# 0 = Sunday ... 6 = Saturday, matching the mobile day picker.
SUNDAY = date(2026, 3, 22)
WEDNESDAY = date(2026, 3, 25)


def _at(day: date, hour: int) -> datetime:
    """A beat run at hour:00 UTC on day."""
    return datetime(day.year, day.month, day.day, hour, tzinfo=UTC)


def test_recipients_include_default_user_on_sunday(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, _at(SUNDAY, 9)) == [(TEST_USER_ID, SUNDAY)]


def test_recipients_skip_opted_out_users(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    user.weekly_summary_enabled = False
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, _at(SUNDAY, 9)) == []


def test_recipients_only_on_users_chosen_day(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    user.weekly_summary_day = 3  # Wednesday
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 21), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, _at(SUNDAY, 9)) == []
    assert _summary_recipients(sync_db, _at(WEDNESDAY, 9)) == [
        (TEST_USER_ID, WEDNESDAY)
    ]


def test_summary_not_duplicated_when_run_twice(sync_db, user, category):
    """A retried or doubled beat run must not send a second summary."""
    week_start = SUNDAY - timedelta(days=7)
    prior_week_start = SUNDAY - timedelta(days=14)
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    for _ in range(2):
        _generate_summary_for_user(
            sync_db, TEST_USER_ID, SUNDAY, week_start, prior_week_start
        )
        sync_db.flush()

    notifications = (
        sync_db.execute(
            select(Notification).where(Notification.type == "weekly_summary")
        )
        .scalars()
        .all()
    )
    assert len(notifications) == 1


def test_beat_schedule_runs_every_hour():
    """Users pick their day, and 9 AM comes at a different UTC hour in each time
    zone, so the beat fires every hour of every day."""
    from app.tasks.celery_app import celery_app

    schedule = celery_app.conf.beat_schedule["weekly-spending-summary"]["schedule"]
    assert schedule.day_of_week == set(range(7))
    assert schedule.hour == set(range(24))
    assert schedule.minute == {0}


def _summary_body(db) -> str:
    return db.execute(
        select(Notification.body).where(
            Notification.user_id == TEST_USER_ID,
            Notification.type == "weekly_summary",
        )
    ).scalar_one()


def test_summary_leaves_out_receipts_in_another_currency(sync_db, user, category):
    today = date(2026, 3, 22)
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 18), [("Milk", 4.50)], category.id
    )
    _create_receipt_with_items(
        sync_db,
        TEST_USER_ID,
        date(2026, 3, 19),
        [("Cheese", 40.00)],
        category.id,
        currency="EUR",
    )

    _generate_summary_for_user(
        sync_db,
        TEST_USER_ID,
        today,
        today - timedelta(days=7),
        today - timedelta(days=14),
    )
    sync_db.flush()

    assert "$4.50" in _summary_body(sync_db)


def test_summary_writes_the_users_currency(sync_db, user, category):
    user.currency_preference = "EUR"
    sync_db.commit()
    today = date(2026, 3, 22)
    _create_receipt_with_items(
        sync_db,
        TEST_USER_ID,
        date(2026, 3, 18),
        [("Cheese", 12.50)],
        category.id,
        currency="EUR",
    )

    _generate_summary_for_user(
        sync_db,
        TEST_USER_ID,
        today,
        today - timedelta(days=7),
        today - timedelta(days=14),
    )
    sync_db.flush()

    body = _summary_body(sync_db)
    assert "€12.50" in body
    assert "$" not in body


# --- BC-06 AC 3: delivered on the chosen day at 9 AM local time ---


def test_recipients_wait_for_9am_in_the_users_time_zone(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    user.timezone = "America/Los_Angeles"  # UTC-7 on 2026-03-22 (PDT)
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, _at(SUNDAY, 9)) == []  # 2 AM in LA
    assert _summary_recipients(sync_db, _at(SUNDAY, 16)) == [(TEST_USER_ID, SUNDAY)]


def test_recipients_east_of_utc_get_their_local_sunday(sync_db, user, category):
    """9 AM Sunday in Sydney (UTC+11 on 2026-03-22) is 22:00 Saturday UTC."""
    from app.tasks.summary_tasks import _summary_recipients

    user.timezone = "Australia/Sydney"
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    saturday = SUNDAY - timedelta(days=1)
    assert _summary_recipients(sync_db, _at(saturday, 22)) == [(TEST_USER_ID, SUNDAY)]


def test_an_unknown_time_zone_falls_back_to_utc(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    user.timezone = "Mars/Olympus"
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, _at(SUNDAY, 9)) == [(TEST_USER_ID, SUNDAY)]


def test_a_rerun_in_the_same_local_day_sends_nothing_new(sync_db, user, category):
    """Sydney's Sunday starts on Saturday UTC: the once-a-day check must use
    the local day, or a second run in the hour sends a second summary."""
    from app.tasks.summary_tasks import generate_weekly_summaries_at

    user.timezone = "Australia/Sydney"
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )
    saturday = SUNDAY - timedelta(days=1)

    for _ in range(2):
        generate_weekly_summaries_at(sync_db, _at(saturday, 22))

    sent = (
        sync_db.execute(
            select(Notification).where(Notification.type == "weekly_summary")
        )
        .scalars()
        .all()
    )
    assert len(sent) == 1


# --- BC-06 AC 1: budget status ---


def _overall_budget(db, amount: float, start: date = date(2026, 3, 1)) -> None:
    from app.models.database import Budget

    db.add(
        Budget(
            user_id=TEST_USER_ID,
            category_id=None,
            amount=amount,
            period_type="monthly",
            period_start=start,
        )
    )
    db.commit()


def _summary_on_sunday(db) -> str:
    _generate_summary_for_user(
        db,
        TEST_USER_ID,
        SUNDAY,
        SUNDAY - timedelta(days=7),
        SUNDAY - timedelta(days=14),
    )
    db.flush()
    return _summary_body(db)


def test_summary_gives_the_budget_status(sync_db, user, category):
    _overall_budget(sync_db, 400.0)
    _create_receipt_with_items(
        sync_db,
        TEST_USER_ID,
        date(2026, 3, 18),
        [("Milk", 4.50), ("Bread", 3.00)],
        category.id,
    )
    # Earlier this month, outside the week: counts toward the month's budget.
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 2), [("Cheese", 92.50)], category.id
    )

    assert "Budget: $100.00 of $400.00 used (25%)." in _summary_on_sunday(sync_db)


def test_summary_says_when_the_budget_is_over(sync_db, user, category):
    _overall_budget(sync_db, 5.0)
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 18), [("Milk", 7.50)], category.id
    )

    assert "Budget: $2.50 over your $5.00 budget." in _summary_on_sunday(sync_db)


def test_summary_without_a_budget_has_no_budget_status(sync_db, user, category):
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 18), [("Milk", 4.50)], category.id
    )

    assert "Budget" not in _summary_on_sunday(sync_db)
