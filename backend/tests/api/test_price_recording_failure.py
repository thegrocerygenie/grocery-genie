"""A failed price recording never fails the confirm or the edit.

ReceiptService._record_prices links lines to canonical items, then rebuilds
their price observations, in one savepoint. Here the rebuild fails after the
lines were linked, so rolling the savepoint back undoes changes made to the
lines. The request must still succeed, log the failure, and send the lines'
values in ReceiptConfirmed and in the response.
"""

import logging
import uuid

import pytest
from sqlalchemy import text

from app.core.seed import seed_default_categories
from app.events.types import ReceiptConfirmed
from app.services.price_service import PriceService
from app.services.receipt_service import ReceiptService
from tests.api.test_items import _scan, _scan_and_confirm
from tests.conftest import DEV_USER_ID

FAILURE_LOG = "Item matching failed for receipt"


@pytest.fixture(autouse=True)
async def seeded_categories(db_session) -> None:
    """Scanned lines get a real category id, so the event's is checked."""
    await seed_default_categories(db_session)


async def _groceries_id(client) -> str:
    categories = (await client.get("/api/categories")).json()
    return next(c["id"] for c in categories if c["name"] == "Groceries")


def _break_price_recording(
    monkeypatch, kind: str = "exception"
) -> list[list[uuid.UUID | None]]:
    """Make PriceService.sync_receipt fail. Each call records the lines'
    canonical item ids first, which shows matching had linked them.

    ``kind`` "exception" raises in Python; "database" fails a statement,
    which on Postgres aborts the transaction until the savepoint rolls back.
    """
    seen: list[list[uuid.UUID | None]] = []

    async def broken(self, receipt):
        seen.append([li.canonical_item_id for li in receipt.line_items])
        if kind == "database":
            await self.db.execute(text("SELECT * FROM no_such_table"))
        raise RuntimeError("price recording blew up")

    monkeypatch.setattr(PriceService, "sync_receipt", broken)
    return seen


@pytest.fixture(params=["exception", "database"])
def linked_then_broken(request, monkeypatch) -> list[list[uuid.UUID | None]]:
    return _break_price_recording(monkeypatch, request.param)


@pytest.fixture
def confirmed_events(monkeypatch) -> list[ReceiptConfirmed]:
    from app.events.dispatcher import dispatcher

    seen: list[ReceiptConfirmed] = []
    original = dispatcher.dispatch

    def spy(event):
        if isinstance(event, ReceiptConfirmed):
            seen.append(event)
        return original(event)

    monkeypatch.setattr(dispatcher, "dispatch", spy)
    return seen


def _assert_logged(caplog) -> None:
    assert any(FAILURE_LOG in r.getMessage() and r.exc_info for r in caplog.records), (
        caplog.text
    )


async def test_confirm_by_patch_survives_a_failed_price_recording(
    client,
    mock_extractor,
    test_image_bytes,
    linked_then_broken,
    confirmed_events,
    caplog,
):
    scan = await _scan(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 2, 0.5),
    )

    with caplog.at_level(logging.ERROR, logger="app.services.receipt_service"):
        resp = await client.patch(
            f"/api/receipts/{scan['receipt_id']}", json={"status": "confirmed"}
        )

    assert resp.status_code == 200, resp.text
    [line] = resp.json()["items"]
    assert (line["raw_name"], line["total_price"]) == ("Limes", 1.0)
    assert line["canonical_item_id"] is None  # the link was undone
    assert all(linked_then_broken[0]), "matching should link the line first"
    _assert_logged(caplog)
    [event] = confirmed_events
    assert event.line_items == [
        {
            "id": line["id"],
            "name": "Limes",
            "total_price": 1.0,
            "category_id": await _groceries_id(client),
        }
    ]


async def test_confirm_receipt_survives_a_failed_price_recording(
    client,
    db_session,
    mock_extractor,
    mock_embedder,
    test_image_bytes,
    linked_then_broken,
    confirmed_events,
    caplog,
):
    scan = await _scan(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 2, 0.5),
    )
    receipt_id = uuid.UUID(scan["receipt_id"])
    service = ReceiptService(db_session, embedder=mock_embedder)

    with caplog.at_level(logging.ERROR, logger="app.services.receipt_service"):
        await service.confirm_receipt(receipt_id, DEV_USER_ID)

    receipt = await service.get_receipt(receipt_id, DEV_USER_ID)
    assert receipt.status == "confirmed"
    [line] = receipt.line_items
    assert line.canonical_item_id is None
    assert all(linked_then_broken[0]), "matching should link the line first"
    _assert_logged(caplog)
    [event] = confirmed_events
    assert event.line_items == [
        {
            "id": str(line.id),
            "name": "Limes",
            "total_price": 1.0,
            "category_id": await _groceries_id(client),
        }
    ]


async def test_manual_receipt_survives_a_failed_price_recording(
    client, linked_then_broken, confirmed_events, caplog
):
    groceries = await _groceries_id(client)

    with caplog.at_level(logging.ERROR, logger="app.services.receipt_service"):
        resp = await client.post(
            "/api/receipts",
            json={
                "store_name": "FreshCo",
                "date": "2026-03-01",
                "total": 1.0,
                "items": [
                    {
                        "name": "Limes",
                        "quantity": 2,
                        "unit_price": 0.5,
                        "total_price": 1.0,
                        "category_id": groceries,
                    }
                ],
            },
        )

    assert resp.status_code == 201, resp.text
    [line] = resp.json()["items"]
    assert (line["raw_name"], line["total_price"]) == ("Limes", 1.0)
    assert line["canonical_item_id"] is None
    assert all(linked_then_broken[0]), "matching should link the line first"
    _assert_logged(caplog)
    [event] = confirmed_events
    assert event.line_items == [
        {
            "id": line["id"],
            "name": "Limes",
            "total_price": 1.0,
            "category_id": groceries,
        }
    ]


@pytest.mark.parametrize("kind", ["exception", "database"])
async def test_edit_of_a_confirmed_receipt_survives_a_failed_price_recording(
    client, mock_extractor, test_image_bytes, monkeypatch, caplog, kind
):
    receipt = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 2, 0.5),
    )
    [line] = receipt["items"]
    assert line["canonical_item_id"] is not None
    seen = _break_price_recording(monkeypatch, kind)

    # A new name unlinks the line, so the edit matches it again.
    with caplog.at_level(logging.ERROR, logger="app.services.receipt_service"):
        resp = await client.patch(
            f"/api/receipts/{receipt['id']}",
            json={"items": [{"id": line["id"], "name": "Key Limes"}]},
        )

    assert resp.status_code == 200, resp.text
    [edited] = resp.json()["items"]
    assert (edited["raw_name"], edited["total_price"]) == ("Key Limes", 1.0)
    assert edited["canonical_item_id"] is None  # unlinked by the rename
    assert all(seen[0]), "matching should link the renamed line first"
    _assert_logged(caplog)
