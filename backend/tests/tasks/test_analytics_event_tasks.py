"""purge_old_analytics_events — app activity is kept 13 months, then erased."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.models.database import AnalyticsEvent, Base, User
from app.tasks.analytics_event_tasks import purge_old_analytics_events

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
RETENTION = timedelta(days=396)


@pytest.fixture
def db():
    engine = create_engine("sqlite://", echo=False)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        session.add(User(id=USER_ID, email="u@test.com", name="U"))
        session.commit()
        yield session
    engine.dispose()


def _event(db, days_ago: float) -> uuid.UUID:
    event = AnalyticsEvent(
        user_id=USER_ID,
        event_name="receipt_scan_started",
        properties={"source": "camera"},
        created_at=NOW - timedelta(days=days_ago),
    )
    db.add(event)
    db.commit()
    return event.id


def _remaining(db) -> set[uuid.UUID]:
    return set(db.execute(select(AnalyticsEvent.id)).scalars())


def test_retention_defaults_to_13_months():
    assert Settings(_env_file=None).analytics_event_retention_days == 396


def test_deletes_events_older_than_the_retention_period(db):
    old = _event(db, days_ago=397)
    kept = _event(db, days_ago=395)

    deleted = purge_old_analytics_events(db, now=NOW, retention=RETENTION)

    assert deleted == 1
    assert _remaining(db) == {kept}
    assert old not in _remaining(db)


def test_purges_in_batches_until_none_are_left(db):
    for _ in range(5):
        _event(db, days_ago=500)

    deleted = purge_old_analytics_events(db, now=NOW, retention=RETENTION, batch_size=2)

    assert deleted == 5
    assert _remaining(db) == set()


def test_a_second_run_deletes_nothing(db):
    _event(db, days_ago=500)
    purge_old_analytics_events(db, now=NOW, retention=RETENTION)

    assert purge_old_analytics_events(db, now=NOW, retention=RETENTION) == 0


def test_beat_runs_the_purge_daily():
    from app.tasks.celery_app import celery_app

    schedule = celery_app.conf.beat_schedule["purge-old-analytics-events"]
    assert (
        schedule["task"] == "app.tasks.analytics_event_tasks.purge_old_analytics_events"
    )
    assert "app.tasks.analytics_event_tasks" in celery_app.conf.include
