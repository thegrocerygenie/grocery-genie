"""Decision D2: Premium gates only the V1.1 extras.

Price history, item matching, price alerts and cross-store comparison stay
free. A free user (the default test user has no entitlement) gets 200 on
each, never ``403 premium_required``. The 12-month trend and the receipt cap
are the extras covered here; custom categories, export and rollover gate
themselves in their own tests.
"""

from httpx import AsyncClient

from tests.api.test_items import _item_id, _suggestion
from tests.api.test_price_comparison import _manual


async def _free_user_with_an_item(client: AsyncClient) -> str:
    me = await client.get("/api/users/me")
    assert me.json()["is_premium"] is False
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.60)
    await _manual(client, "FreshCo", "2026-03-15", "Limes", 0.80)
    await _manual(client, "Loblaws", "2026-03-03", "Limes", 0.90)
    await _manual(client, "Loblaws", "2026-03-10", "Limes", 1.00)
    return await _item_id(client, "limes")


def _assert_free(resp) -> None:
    """Served to a free user: 200 (204 for a mute), never 403 premium_required."""
    assert resp.status_code in (200, 204), resp.text


async def test_price_history_is_free(client):
    item_id = await _free_user_with_an_item(client)
    resp = await client.get(f"/api/items/{item_id}/prices")
    _assert_free(resp)
    assert len(resp.json()["observations"]) == 4


async def test_price_comparison_is_free(client):
    item_id = await _free_user_with_an_item(client)
    resp = await client.get(f"/api/items/{item_id}/compare")
    _assert_free(resp)
    assert {s["store_name"] for s in resp.json()["stores"]} == {"FreshCo", "Loblaws"}


async def test_item_matching_is_free(client):
    item_id = await _free_user_with_an_item(client)
    for resp in (
        await client.get("/api/items"),
        await client.get(f"/api/items/{item_id}"),
        await client.get("/api/items/suggestions"),
        await client.patch(f"/api/items/{item_id}", json={"canonical_name": "Lime"}),
    ):
        _assert_free(resp)


async def _assert_free_user(client: AsyncClient) -> None:
    assert (await client.get("/api/users/me")).json()["is_premium"] is False


async def test_merge_and_split_are_free(client):
    """PI-02 AC 3 (link and unlink names) is item matching: free under D2."""
    await _assert_free_user(client)
    await _manual(client, "FreshCo", "2026-03-01", "Seltzer", 1.00)
    await _manual(client, "FreshCo", "2026-03-02", "Club Soda", 1.10)
    seltzer = await _item_id(client, "seltzer")
    club_soda = await _item_id(client, "club")

    merged = await client.post(
        f"/api/items/{club_soda}/merge", json={"into_item_id": seltzer}
    )
    _assert_free(merged)
    alias_id = next(
        a["id"] for a in merged.json()["aliases"] if a["alias"] == "Club Soda"
    )
    split = await client.post(f"/api/items/{seltzer}/aliases/{alias_id}/split")
    assert split.status_code == 201, split.text


async def test_accepting_a_suggestion_is_free(client, mock_extractor, test_image_bytes):
    """PI-02 AC 2: confirming a medium-confidence match is free under D2."""
    await _assert_free_user(client)
    suggestion = await _suggestion(client, mock_extractor, test_image_bytes)
    _assert_free(await client.post(f"/api/items/suggestions/{suggestion['id']}/accept"))


async def test_rejecting_a_suggestion_is_free(client, mock_extractor, test_image_bytes):
    """PI-02 AC 2: turning a suggested match down is free under D2."""
    await _assert_free_user(client)
    suggestion = await _suggestion(client, mock_extractor, test_image_bytes)
    _assert_free(await client.post(f"/api/items/suggestions/{suggestion['id']}/reject"))


async def test_price_alerts_are_free(client):
    item_id = await _free_user_with_an_item(client)
    for resp in (
        await client.get("/api/items/price-alert-settings"),
        await client.put(
            "/api/items/price-alert-settings",
            json={"enabled": True, "threshold_percent": 15},
        ),
        await client.post(f"/api/items/{item_id}/mute"),
        await client.delete(f"/api/items/{item_id}/mute"),
        await client.get("/api/notifications"),
    ):
        _assert_free(resp)


async def test_three_month_trend_is_free_and_twelve_is_premium(client):
    _assert_free(await client.get("/api/dashboard/spending"))
    _assert_free(await client.get("/api/dashboard/spending?months=3"))
    resp = await client.get("/api/dashboard/spending?months=12")
    assert resp.status_code == 403
    assert resp.json() == {
        "detail": {
            "code": "premium_required",
            "feature": "trend_12_months",
            "message": "This feature is part of Grocery Genie Premium.",
        }
    }
