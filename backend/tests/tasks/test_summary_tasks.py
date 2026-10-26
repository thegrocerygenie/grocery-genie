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


def _create_receipt_with_items(db, user_id, receipt_date, items_data, category_id=None):
    """Helper: create a confirmed receipt with line items."""
    receipt = Receipt(
        user_id=user_id,
        date=receipt_date,
        status="confirmed",
        currency="USD",
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


def test_recipients_include_default_user_on_sunday(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, SUNDAY) == [TEST_USER_ID]


def test_recipients_skip_opted_out_users(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    user.weekly_summary_enabled = False
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 20), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, SUNDAY) == []


def test_recipients_only_on_users_chosen_day(sync_db, user, category):
    from app.tasks.summary_tasks import _summary_recipients

    user.weekly_summary_day = 3  # Wednesday
    sync_db.commit()
    _create_receipt_with_items(
        sync_db, TEST_USER_ID, date(2026, 3, 21), [("Milk", 4.50)], category.id
    )

    assert _summary_recipients(sync_db, SUNDAY) == []
    assert _summary_recipients(sync_db, WEDNESDAY) == [TEST_USER_ID]


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


def test_beat_schedule_runs_daily():
    """Users pick their summary day, so the beat must fire every day."""
    from app.tasks.celery_app import celery_app

    schedule = celery_app.conf.beat_schedule["weekly-spending-summary"]["schedule"]
    assert schedule.day_of_week == set(range(7))
