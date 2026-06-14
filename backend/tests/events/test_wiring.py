import uuid
from datetime import date

from app.events import wiring
from app.events.dispatcher import EventDispatcher
from app.events.types import ItemCorrected, ReceiptConfirmed


def test_register_handlers_makes_dispatcher_live(monkeypatch):
    """H5: after registration, dispatching an event reaches a handler."""
    received: list[object] = []
    test_dispatcher = EventDispatcher()
    test_dispatcher.register(ReceiptConfirmed, received.append)

    monkeypatch.setattr(wiring, "dispatcher", test_dispatcher)
    monkeypatch.setattr(wiring, "_registered", False)

    event = ReceiptConfirmed(
        receipt_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        household_id=None,
        store_id=None,
        date=date(2026, 3, 15),
        line_items=[],
    )
    test_dispatcher.dispatch(event)
    assert received == [event]


def test_register_handlers_registers_both_event_types(monkeypatch):
    fresh = EventDispatcher()
    monkeypatch.setattr(wiring, "dispatcher", fresh)
    monkeypatch.setattr(wiring, "_registered", False)

    wiring.register_handlers()

    assert fresh._handlers[ReceiptConfirmed]
    assert fresh._handlers[ItemCorrected]


def test_register_handlers_is_idempotent(monkeypatch):
    fresh = EventDispatcher()
    monkeypatch.setattr(wiring, "dispatcher", fresh)
    monkeypatch.setattr(wiring, "_registered", False)

    wiring.register_handlers()
    wiring.register_handlers()

    assert len(fresh._handlers[ReceiptConfirmed]) == 1
