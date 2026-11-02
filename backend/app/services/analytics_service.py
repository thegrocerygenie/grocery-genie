import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Annotated, Protocol

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.dependencies import async_session_factory
from app.models.database import AnalyticsEvent

logger = logging.getLogger("analytics")

# Header values are the app's own, but a client can send anything: cut them to
# the column sizes.
_DEVICE_TYPE_MAX = 64
_APP_VERSION_MAX = 32


class AnalyticsBackend(Protocol):
    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None: ...


class ConsoleAnalyticsBackend:
    """Log analytics events to the structured log. Used outside a request."""

    def __init__(self) -> None:
        self.logger = logger

    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None:
        self.logger.info(
            "analytics_event: %s user=%s properties=%s timestamp=%s",
            event_name,
            str(user_id),
            properties,
            datetime.now(UTC).isoformat(),
        )


class AnalyticsWriter(Protocol):
    async def write(self, events: list[AnalyticsEvent]) -> None: ...


class DatabaseAnalyticsWriter:
    """Saves events in a session of their own.

    The request's own transaction rolls back when the request fails, and a
    failed scan is still a started scan, so events never share it.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def write(self, events: list[AnalyticsEvent]) -> None:
        async with self._session_factory() as session:
            session.add_all(events)
            await session.commit()


class LogAnalyticsWriter:
    """Logs events instead of saving them (analytics_storage = "log")."""

    async def write(self, events: list[AnalyticsEvent]) -> None:
        for event in events:
            logger.info(
                "analytics_event: %s user=%s properties=%s device=%s version=%s",
                event.event_name,
                event.user_id,
                event.properties,
                event.device_type,
                event.app_version,
            )


def get_analytics_writer() -> AnalyticsWriter:
    if get_settings().analytics_storage == "log":
        return LogAnalyticsWriter()
    return DatabaseAnalyticsWriter(async_session_factory)


class BufferedAnalyticsBackend:
    """Collects a request's events with its device type and app version, for
    one write when the request ends."""

    def __init__(self, device_type: str | None, app_version: str | None) -> None:
        self.device_type = device_type
        self.app_version = app_version
        self.events: list[AnalyticsEvent] = []

    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None:
        self.events.append(
            AnalyticsEvent(
                user_id=user_id,
                event_name=event_name,
                properties=dict(properties),
                device_type=self.device_type,
                app_version=self.app_version,
                created_at=datetime.now(UTC),
            )
        )

    async def flush(self, writer: AnalyticsWriter) -> None:
        """Write the collected events. Analytics never fails a request: a
        failed write is logged (event names only) and the events are dropped."""
        events, self.events = self.events, []
        if not events:
            return
        try:
            await writer.write(events)
        except Exception as exc:
            logger.error(
                "Analytics events not saved (%s): %s",
                type(exc).__name__,
                ", ".join(event.event_name for event in events),
            )


class AnalyticsService:
    def __init__(self, backend: AnalyticsBackend | None = None) -> None:
        self.backend = backend or ConsoleAnalyticsBackend()

    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None:
        self.backend.emit(event_name, properties, user_id)


def _header(request: Request, name: str, max_length: int) -> str | None:
    value = request.headers.get(name, "").strip()
    return value[:max_length] or None


async def get_analytics_service(
    request: Request,
    writer: Annotated[AnalyticsWriter, Depends(get_analytics_writer)],
) -> AsyncGenerator[AnalyticsService, None]:
    """One service per request; its events are written when the endpoint ends,
    whether it succeeded or raised."""
    backend = BufferedAnalyticsBackend(
        device_type=_header(request, "x-device-type", _DEVICE_TYPE_MAX),
        app_version=_header(request, "x-app-version", _APP_VERSION_MAX),
    )
    try:
        yield AnalyticsService(backend=backend)
    finally:
        await backend.flush(writer)
