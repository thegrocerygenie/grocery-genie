import logging
import uuid

from app.services.analytics_service import AnalyticsService, ConsoleAnalyticsBackend


def test_console_backend_logs(caplog):
    backend = ConsoleAnalyticsBackend()
    user_id = uuid.uuid4()
    with caplog.at_level(logging.INFO, logger="analytics"):
        backend.emit("test_event", {"key": "value"}, user_id)
    assert "test_event" in caplog.text
    assert str(user_id) in caplog.text


def test_analytics_service_delegates_to_backend():
    calls = []

    class MockBackend:
        def emit(self, event_name, properties, user_id):
            calls.append((event_name, properties, user_id))

    service = AnalyticsService(backend=MockBackend())
    uid = uuid.uuid4()
    service.emit("test", {"a": 1}, uid)
    assert len(calls) == 1
    assert calls[0] == ("test", {"a": 1}, uid)


def test_default_backend_is_console():
    service = AnalyticsService()
    assert isinstance(service.backend, ConsoleAnalyticsBackend)


# --- Writers: where a request's events go ---


async def test_database_writer_commits_in_its_own_session(tmp_path):
    """Events must outlive the request's transaction, which rolls back when
    the request fails: the writer commits a session of its own."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    from app.models.database import AnalyticsEvent, Base, User
    from app.services.analytics_service import DatabaseAnalyticsWriter

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'a.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    user_id = uuid.uuid4()
    async with factory() as db:
        db.add(User(id=user_id, email="w@test.com", name="W"))
        await db.commit()

    await DatabaseAnalyticsWriter(factory).write(
        [AnalyticsEvent(user_id=user_id, event_name="budget_created", properties={})]
    )

    async with factory() as other:
        names = (await other.execute(select(AnalyticsEvent.event_name))).scalars()
        assert list(names) == ["budget_created"]
    await engine.dispose()


def test_the_storage_setting_picks_the_writer(monkeypatch):
    from app.core.config import Settings
    from app.services import analytics_service

    for storage, expected in (
        ("database", analytics_service.DatabaseAnalyticsWriter),
        ("log", analytics_service.LogAnalyticsWriter),
    ):
        settings = Settings(_env_file=None, analytics_storage=storage)
        monkeypatch.setattr(analytics_service, "get_settings", lambda s=settings: s)
        assert isinstance(analytics_service.get_analytics_writer(), expected)


async def test_log_writer_logs_each_event(caplog):
    from app.models.database import AnalyticsEvent
    from app.services.analytics_service import LogAnalyticsWriter

    with caplog.at_level(logging.INFO, logger="analytics"):
        await LogAnalyticsWriter().write(
            [
                AnalyticsEvent(
                    user_id=uuid.uuid4(),
                    event_name="receipt_scan_started",
                    properties={"source": "camera"},
                    device_type="iPhone16,2",
                    app_version="1.0.3",
                )
            ]
        )

    assert "receipt_scan_started" in caplog.text
    assert "iPhone16,2" in caplog.text
