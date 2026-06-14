"""Event handler registration.

Wires concrete handlers onto the in-process dispatcher so domain events have a
real consequence instead of dispatching into the void. Call ``register_handlers``
once at application startup.

Note on scope: the budget-recalc + notification work for ``ReceiptConfirmed``
deliberately stays inline in ``ReceiptService.confirm_receipt`` for the MVP — it
must run inside the request's async DB transaction. These handlers provide
cross-cutting observability today and a seam for async/out-of-band handlers
(Celery/Redis) later.
"""

import logging

from app.events.dispatcher import dispatcher
from app.events.types import ItemCorrected, ReceiptConfirmed

logger = logging.getLogger("app.events")

_registered = False


def on_receipt_confirmed(event: ReceiptConfirmed) -> None:
    logger.info(
        "ReceiptConfirmed receipt=%s user=%s items=%d",
        event.receipt_id,
        event.user_id,
        len(event.line_items),
    )


def on_item_corrected(event: ItemCorrected) -> None:
    logger.info(
        "ItemCorrected line_item=%s field=%s user=%s",
        event.line_item_id,
        event.field,
        event.user_id,
    )


def register_handlers() -> None:
    """Register all event handlers. Idempotent — safe to call more than once."""
    global _registered
    if _registered:
        return
    dispatcher.register(ReceiptConfirmed, on_receipt_confirmed)
    dispatcher.register(ItemCorrected, on_item_corrected)
    _registered = True
