import logging
import uuid
from datetime import UTC, datetime
from typing import Protocol


class AnalyticsBackend(Protocol):
    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None: ...


class ConsoleAnalyticsBackend:
    """MVP implementation: log analytics events to structured log."""

    def __init__(self) -> None:
        self.logger = logging.getLogger("analytics")

    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None:
        self.logger.info(
            "analytics_event: %s user=%s properties=%s timestamp=%s",
            event_name,
            str(user_id),
            properties,
            datetime.now(UTC).isoformat(),
        )


class AnalyticsService:
    def __init__(self, backend: AnalyticsBackend | None = None) -> None:
        self.backend = backend or ConsoleAnalyticsBackend()

    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None:
        self.backend.emit(event_name, properties, user_id)


def get_analytics_service() -> AnalyticsService:
    return AnalyticsService()
