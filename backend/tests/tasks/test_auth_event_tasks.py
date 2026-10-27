"""purge_old_auth_events — sign-in activity (IP, user agent) is not kept forever."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.models.database import AuthEvent, Base, User
from app.tasks.auth_event_tasks import purge_old_auth_events

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 10, 27, 12, 0, tzinfo=UTC)
RETENTION = timedelta(days=365)


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


def _event(db, days_ago: float, user_id: uuid.UUID | None = USER_ID) -> uuid.UUID:
    event = AuthEvent(
        user_id=user_id,
        event_type="signin_success" if user_id else "signin_failed",
        ip="203.0.113.7",
        user_agent="GroceryGenie/1.0 iOS",
        created_at=NOW - timedelta(days=days_ago),
    )
    db.add(event)
    db.commit()
    return event.id


def _remaining(db) -> set[uuid.UUID]:
    return set(db.execute(select(AuthEvent.id)).scalars())


def test_deletes_events_older_than_the_retention_period(db):
    old = _event(db, days_ago=366)
    old_anonymous = _event(db, days_ago=400, user_id=None)
    recent = _event(db, days_ago=364)

    purged = purge_old_auth_events(db, now=NOW, retention=RETENTION)

    assert purged == 2
    assert _remaining(db) == {recent}
    assert old not in _remaining(db) and old_anonymous not in _remaining(db)


def test_keeps_an_event_exactly_at_the_cutoff(db):
    at_cutoff = _event(db, days_ago=365)

    assert purge_old_auth_events(db, now=NOW, retention=RETENTION) == 0
    assert _remaining(db) == {at_cutoff}


def test_deletes_in_batches_until_none_are_left(db):
    for _ in range(7):
        _event(db, days_ago=500)
    keep = _event(db, days_ago=10)

    purged = purge_old_auth_events(db, now=NOW, retention=RETENTION, batch_size=3)

    assert purged == 7
    assert _remaining(db) == {keep}


def test_a_second_run_deletes_nothing(db):
    _event(db, days_ago=500)
    keep = _event(db, days_ago=1)

    purge_old_auth_events(db, now=NOW, retention=RETENTION)
    assert purge_old_auth_events(db, now=NOW, retention=RETENTION) == 0
    assert db.execute(select(func.count(AuthEvent.id))).scalar() == 1
    assert _remaining(db) == {keep}


def test_retention_defaults_to_twelve_months():
    assert Settings(_env_file=None).auth_event_retention_days == 365


def test_retention_must_be_positive():
    with pytest.raises(ValueError):
        Settings(_env_file=None, auth_event_retention_days=0)
