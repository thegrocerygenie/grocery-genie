"""purge_expired_deletions — hard-deletes what the restore window has let go."""

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from app.core.retention import RESTORE_WINDOW
from app.models.database import (
    Base,
    Budget,
    BudgetAlertSent,
    LineItem,
    Notification,
    Receipt,
    ReceiptCorrection,
    User,
)
from app.tasks.purge_tasks import purge_expired_deletions

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 10, 27, 12, 0, tzinfo=UTC)


@pytest.fixture
def db():
    engine = create_engine("sqlite://", echo=False)

    # Enforce FKs, as Postgres does, so a wrong delete order fails here.
    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        session.add(User(id=USER_ID, email="u@test.com", name="U"))
        session.commit()
        yield session
    engine.dispose()


@pytest.fixture
def storage(tmp_path) -> Path:
    return tmp_path


def _receipt(db, storage: Path, deleted_days_ago: float | None) -> Receipt:
    deleted_at = (
        None if deleted_days_ago is None else NOW - timedelta(days=deleted_days_ago)
    )
    receipt = Receipt(
        user_id=USER_ID, date=date(2026, 9, 1), total=12.5, deleted_at=deleted_at
    )
    db.add(receipt)
    db.flush()
    item = LineItem(
        receipt_id=receipt.id, raw_name="MILK", unit_price=2.5, total_price=2.5
    )
    db.add(item)
    db.flush()
    db.add(
        ReceiptCorrection(
            receipt_id=receipt.id,
            line_item_id=item.id,
            user_id=USER_ID,
            field="name",
            original_value="MLK",
            corrected_value="MILK",
        )
    )
    db.commit()
    folder = storage / "receipts"
    folder.mkdir(exist_ok=True)
    for name in (f"{receipt.id}.heic", f"{receipt.id}.jpg", f"{receipt.id}_thumb.jpg"):
        (folder / name).write_bytes(b"img")
    return receipt


def _budget(db, deleted_days_ago: float | None, period_start=date(2026, 9, 1)):
    deleted_at = (
        None if deleted_days_ago is None else NOW - timedelta(days=deleted_days_ago)
    )
    budget = Budget(
        user_id=USER_ID, amount=400, period_start=period_start, deleted_at=deleted_at
    )
    db.add(budget)
    db.flush()
    db.add(
        BudgetAlertSent(
            budget_id=budget.id, period_start=period_start, threshold_percent=80
        )
    )
    db.add(
        Notification(
            user_id=USER_ID,
            type="budget_threshold",
            title="Budget 80% Reached",
            body="$80.00 remaining with 5 days left in this period.",
            data=json.dumps({"budget_id": str(budget.id), "threshold": 80}),
        )
    )
    db.commit()
    return budget


def _count(db, model, **where) -> int:
    query = select(func.count()).select_from(model)
    for column, value in where.items():
        query = query.where(getattr(model, column) == value)
    return db.execute(query).scalar_one()


def _files(storage: Path, receipt_id) -> list[str]:
    return sorted(p.name for p in (storage / "receipts").glob(f"{receipt_id}*"))


def _purge(db, storage, **kwargs):
    return purge_expired_deletions(db, storage_path=str(storage), now=NOW, **kwargs)


def test_receipt_deleted_31_days_ago_is_erased_with_items_and_images(db, storage):
    receipt = _receipt(db, storage, deleted_days_ago=31)

    result = _purge(db, storage)

    assert result.receipts == 1
    assert result.files == 3
    assert _count(db, Receipt, id=receipt.id) == 0
    assert _count(db, LineItem, receipt_id=receipt.id) == 0
    assert _count(db, ReceiptCorrection, receipt_id=receipt.id) == 0
    assert _files(storage, receipt.id) == []


def test_receipt_deleted_29_days_ago_is_kept(db, storage):
    receipt = _receipt(db, storage, deleted_days_ago=29)

    result = _purge(db, storage)

    assert result.receipts == 0
    assert _count(db, Receipt, id=receipt.id) == 1
    assert _count(db, LineItem, receipt_id=receipt.id) == 1
    assert len(_files(storage, receipt.id)) == 3


def test_receipt_on_the_window_edge_is_kept(db, storage):
    """Restore still accepts deleted_at == now - window, so purge must not."""
    receipt = _receipt(db, storage, deleted_days_ago=RESTORE_WINDOW.days)

    _purge(db, storage)

    assert _count(db, Receipt, id=receipt.id) == 1


def test_active_receipt_is_kept(db, storage):
    receipt = _receipt(db, storage, deleted_days_ago=None)

    _purge(db, storage)

    assert _count(db, Receipt, id=receipt.id) == 1
    assert len(_files(storage, receipt.id)) == 3


def test_budget_deleted_31_days_ago_is_erased_with_alerts_and_notifications(
    db, storage
):
    budget_id = _budget(db, deleted_days_ago=31).id
    kept_id = _budget(db, deleted_days_ago=None, period_start=date(2026, 10, 1)).id
    summary = Notification(
        user_id=USER_ID, type="weekly_summary", title="Weekly", body="This week: $5"
    )
    db.add(summary)
    db.commit()

    result = _purge(db, storage)

    assert result.budgets == 1
    assert _count(db, Budget, id=budget_id) == 0
    assert _count(db, BudgetAlertSent, budget_id=budget_id) == 0
    assert _count(db, Budget, id=kept_id) == 1
    assert _count(db, BudgetAlertSent, budget_id=kept_id) == 1
    remaining = db.execute(select(Notification.data, Notification.type)).all()
    assert sorted(t for _, t in remaining) == ["budget_threshold", "weekly_summary"]
    assert all(str(budget_id) not in (d or "") for d, _ in remaining)


def test_budget_deleted_29_days_ago_is_kept(db, storage):
    budget = _budget(db, deleted_days_ago=29)

    result = _purge(db, storage)

    assert result.budgets == 0
    assert _count(db, Budget, id=budget.id) == 1
    assert _count(db, BudgetAlertSent, budget_id=budget.id) == 1
    assert _count(db, Notification) == 1


def test_running_twice_ends_the_same(db, storage):
    old = _receipt(db, storage, deleted_days_ago=40)
    fresh = _receipt(db, storage, deleted_days_ago=3)
    _budget(db, deleted_days_ago=40)

    first = _purge(db, storage)
    second = _purge(db, storage)

    assert (first.receipts, first.budgets) == (1, 1)
    assert (second.receipts, second.budgets) == (0, 0)
    assert _count(db, Receipt, id=old.id) == 0
    assert _count(db, Receipt, id=fresh.id) == 1
    assert _count(db, Budget) == 0


def test_rerun_after_a_crash_that_already_removed_the_images(db, storage):
    """A run that died after deleting files but before its commit."""
    receipt = _receipt(db, storage, deleted_days_ago=31)
    for path in (storage / "receipts").glob(f"{receipt.id}*"):
        path.unlink()

    result = _purge(db, storage)

    assert result.receipts == 1
    assert result.files == 0
    assert _count(db, Receipt, id=receipt.id) == 0


def test_rerun_after_a_crash_before_commit(db, storage, monkeypatch):
    """A run that died mid-batch leaves the rows; the next run erases them."""
    receipt = _receipt(db, storage, deleted_days_ago=31)

    def die():
        raise RuntimeError("worker killed")

    monkeypatch.setattr(db, "commit", die)
    with pytest.raises(RuntimeError):
        _purge(db, storage)
    monkeypatch.undo()
    db.rollback()

    assert _count(db, Receipt, id=receipt.id) == 1  # nothing half-deleted
    _purge(db, storage)
    assert _count(db, Receipt, id=receipt.id) == 0
    assert _count(db, LineItem) == 0
    assert _files(storage, receipt.id) == []


def test_works_through_every_batch(db, storage):
    receipts = [_receipt(db, storage, deleted_days_ago=31 + i) for i in range(5)]
    for i in range(3):
        _budget(db, deleted_days_ago=31 + i, period_start=date(2026, 1 + i, 1))

    result = _purge(db, storage, batch_size=2)

    assert (result.receipts, result.budgets) == (5, 3)
    assert _count(db, Receipt) == 0
    assert _count(db, Budget) == 0
    assert all(_files(storage, r.id) == [] for r in receipts)


def test_purge_runs_daily_on_beat():
    from app.tasks.celery_app import celery_app

    celery_app.loader.import_default_modules()

    assert "app.tasks.purge_tasks.purge_expired_deletions" in celery_app.tasks
    schedules = [e["task"] for e in celery_app.conf.beat_schedule.values()]
    assert "app.tasks.purge_tasks.purge_expired_deletions" in schedules
