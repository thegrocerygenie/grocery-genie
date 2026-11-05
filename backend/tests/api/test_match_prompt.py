"""PI-02 AC 5-9 (DA-5): what the "Same item?" prompt reads from the API.

Each suggestion carries the receipt line it was raised by (name as printed,
store, date) and the existing item's purchase count, store count and average
unit price; ``?receipt_id=`` narrows the list to one receipt's suggestions.
Everything is the caller's own: another user's receipt is 404, and another
user's prices never count.
"""

import uuid

from app.services.item_matching_service import ItemMatchingService
from app.services.price_service import PriceService
from tests.api.test_items import _scan_and_confirm
from tests.conftest import DEV_USER_ID, USER_B_ID
from tests.services.test_item_matching import _receipt


async def _cucumbers(client, mock_extractor, image):
    """Two Cucumber purchases at two stores, then a receipt that asks."""
    await _scan_and_confirm(
        client, mock_extractor, image, "FreshCo", "2026-03-01", ("Cucumber", 1, 1.0)
    )
    await _scan_and_confirm(
        client, mock_extractor, image, "Metro", "2026-03-04", ("Cucumber", 2, 1.5)
    )
    asking = await _scan_and_confirm(
        client,
        mock_extractor,
        image,
        "FreshCo",
        "2026-03-08",
        ("CUCUMBERS ENG", 1, 1.29),
        ("Limes", 1, 0.5),
    )
    return asking


async def test_a_suggestion_carries_what_the_prompt_shows(
    client, mock_extractor, test_image_bytes
):
    """PI-02 AC 5, 8: receipt line, store, date; purchases, stores, average."""
    asking = await _cucumbers(client, mock_extractor, test_image_bytes)

    [suggestion] = (await client.get("/api/items/suggestions")).json()

    assert suggestion["receipt_line"] == {
        "receipt_id": asking["id"],
        "name": "CUCUMBERS ENG",
        "store_name": "FreshCo",
        "date": "2026-03-08",
    }
    assert suggestion["suggested_item_stats"] == {
        "purchase_count": 2,
        "store_count": 2,
        "avg_unit_price": 1.25,
        "unit_of_measure": None,
        "currency": "USD",
    }
    # Item detail carries the same fields on its suggestions.
    detail = (await client.get(f"/api/items/{suggestion['item']['id']}")).json()
    assert detail["suggestions"][0]["receipt_line"]["name"] == "CUCUMBERS ENG"
    assert detail["suggestions"][0]["suggested_item_stats"]["purchase_count"] == 2


async def test_receipt_id_returns_only_that_receipts_suggestions(
    client, mock_extractor, test_image_bytes
):
    """PI-02 AC 7, 8: the post-scan prompt asks only about that receipt."""
    asking = await _cucumbers(client, mock_extractor, test_image_bytes)
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "Metro",
        "2026-03-09",
        ("Tomato", 1, 0.8),
    )
    second = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "Metro",
        "2026-03-10",
        ("TOMATOES VINE", 1, 0.9),
    )
    quiet = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "Metro",
        "2026-03-11",
        ("Limes", 1, 0.5),
    )

    everything = (await client.get("/api/items/suggestions")).json()
    first = (
        await client.get("/api/items/suggestions", params={"receipt_id": asking["id"]})
    ).json()
    tomato = (
        await client.get("/api/items/suggestions", params={"receipt_id": second["id"]})
    ).json()
    none = await client.get(
        "/api/items/suggestions", params={"receipt_id": quiet["id"]}
    )

    assert len(everything) == 2
    assert [s["receipt_line"]["name"] for s in first] == ["CUCUMBERS ENG"]
    assert [s["receipt_line"]["name"] for s in tomato] == ["TOMATOES VINE"]
    assert none.status_code == 200
    assert none.json() == []


async def test_a_repeat_of_the_name_does_not_raise_the_suggestion_again(
    client, mock_extractor, test_image_bytes
):
    """PI-02 AC 7: a later receipt with the same name (an exact alias) did not
    raise the suggestion, so its post-scan prompt does not ask again."""
    await _cucumbers(client, mock_extractor, test_image_bytes)
    later = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-15",
        ("CUCUMBERS ENG", 1, 1.35),
    )

    resp = await client.get(
        "/api/items/suggestions", params={"receipt_id": later["id"]}
    )

    assert resp.json() == []


async def test_unknown_receipt_is_404(client):
    resp = await client.get(
        "/api/items/suggestions", params={"receipt_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 404


async def test_another_users_receipt_is_404_and_their_suggestions_stay_theirs(
    client_user_b, db_session
):
    """PI-02 AC 8, two users: B cannot list A's receipt's suggestions, and
    sees none of A's."""
    service = ItemMatchingService(db_session)
    _, first = await _receipt(db_session, "Cucumber", user_id=DEV_USER_ID)
    await service.match_line_items(DEV_USER_ID, first)
    receipt_a, second = await _receipt(db_session, "CUCUMBERS ENG", user_id=DEV_USER_ID)
    await service.match_line_items(DEV_USER_ID, second)
    assert len(await service.list_suggestions(DEV_USER_ID)) == 1

    resp = await client_user_b.get(
        "/api/items/suggestions", params={"receipt_id": str(receipt_a.id)}
    )

    assert resp.status_code == 404
    assert (await client_user_b.get("/api/items/suggestions")).json() == []


async def test_counts_and_average_are_the_callers_own(
    client, mock_extractor, test_image_bytes, db_session
):
    """PI-02 AC 8, two users: B's Cucumber purchases never reach A's counts."""
    service = ItemMatchingService(db_session)
    for _ in range(3):
        receipt_b, lines = await _receipt(db_session, "Cucumber", user_id=USER_B_ID)
        await service.match_line_items(USER_B_ID, lines)
        await db_session.refresh(receipt_b, ["line_items"])
        await PriceService(db_session).sync_receipt(receipt_b)

    await _cucumbers(client, mock_extractor, test_image_bytes)
    [suggestion] = (await client.get("/api/items/suggestions")).json()

    assert suggestion["suggested_item_stats"]["purchase_count"] == 2
    assert suggestion["suggested_item_stats"]["store_count"] == 2
    assert suggestion["suggested_item_stats"]["avg_unit_price"] == 1.25
