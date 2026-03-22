import logging
from collections import defaultdict
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)


class EventDispatcher:
    """Simple in-process event dispatcher.

    Designed for drop-in replacement with Celery/Redis-backed dispatch later.
    """

    def __init__(self) -> None:
        self._handlers: dict[type, list[Callable]] = defaultdict(list)

    def register(self, event_type: type, handler: Callable) -> None:
        self._handlers[event_type].append(handler)

    def dispatch(self, event: Any) -> None:
        event_type = type(event)
        handlers = self._handlers.get(event_type, [])
        for handler in handlers:
            try:
                handler(event)
            except Exception:
                logger.exception(
                    "Error in event handler %s for %s",
                    handler.__name__,
                    event_type.__name__,
                )


dispatcher = EventDispatcher()
