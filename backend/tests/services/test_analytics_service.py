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
