"""What Premium gates, and what stays free (decisions D2 and D8).

D2: price history, item matching and price alerts stay free. A free user (the
default test user has no entitlement) gets 200 on each, never ``403
premium_required``. D8 (PREM-02): cross-store comparison and muting price
alerts are Premium; unmuting stays open to everyone, and a mute made while
Premium keeps working after a lapse. The entitlement is the stored one,
written only from RevenueCat. The 12-month trend and the receipt cap are
covered here too; custom categories, export and rollover gate themselves in
their own tests.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.core import clock
from tests.api.test_items import _item_id, _suggestion, analytics_spy  # noqa: F401
from tests.api.test_price_alerts import (
    NOW,
    _buy,
    _history,
    _price_alerts,
    _store_id,
)
from tests.api.test_price_comparison import _manual
from tests.conftest import DEV_USER_ID, set_premium


@pytest.fixture
def march_20(monkeypatch) -> None:
    """The alert tests' wall clock (rolling average, cooldown)."""
    monkeypatch.setattr(clock, "now", lambda: NOW)


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


def _assert_premium_required(resp, feature: str) -> None:
    assert resp.status_code == 403, resp.text
    assert resp.json() == {
        "detail": {
            "code": "premium_required",
            "feature": feature,
            "message": "This feature is part of Grocery Genie Premium.",
        }
    }


async def test_price_comparison_is_premium(client, db_session):
    """PREM-02 AC 1: a free user gets 403 premium_required, Premium gets 200."""
    item_id = await _free_user_with_an_item(client)
    resp = await client.get(f"/api/items/{item_id}/compare")
    _assert_premium_required(resp, "price_comparison")

    await set_premium(db_session, DEV_USER_ID, True)
    resp = await client.get(f"/api/items/{item_id}/compare")
    assert resp.status_code == 200, resp.text
    assert {s["store_name"] for s in resp.json()["stores"]} == {"FreshCo", "Loblaws"}


async def test_muting_is_premium_and_unmuting_is_open(client, db_session):
    """PREM-02 AC 2: both mute POSTs are 403 for a free user; both DELETEs 204."""
    item_id = await _free_user_with_an_item(client)
    store_id = (await client.get("/api/stores")).json()["stores"][0]["id"]

    _assert_premium_required(
        await client.post(f"/api/items/{item_id}/mute"), "price_alert_mute"
    )
    _assert_premium_required(
        await client.post(f"/api/stores/{store_id}/mute"), "price_alert_mute"
    )
    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_items"] == [] and settings["muted_stores"] == []
    assert (await client.delete(f"/api/items/{item_id}/mute")).status_code == 204
    assert (await client.delete(f"/api/stores/{store_id}/mute")).status_code == 204

    await set_premium(db_session, DEV_USER_ID, True)
    assert (await client.post(f"/api/items/{item_id}/mute")).status_code == 204
    assert (await client.post(f"/api/stores/{store_id}/mute")).status_code == 204


async def _assert_free_calls_are_403(client, item_id, store_id) -> None:
    _assert_premium_required(
        await client.get(f"/api/items/{item_id}/compare"), "price_comparison"
    )
    _assert_premium_required(
        await client.post(f"/api/items/{item_id}/mute"), "price_alert_mute"
    )
    _assert_premium_required(
        await client.post(f"/api/stores/{store_id}/mute"), "price_alert_mute"
    )


async def test_the_premium_check_comes_before_an_unknown_id(client):
    """08-api-contracts: a free user gets 403, not 404, for an id that is not
    theirs or does not exist, so the gate never says whether an id exists."""
    await _assert_free_user(client)
    await _assert_free_calls_are_403(client, uuid.uuid4(), uuid.uuid4())


async def test_the_premium_check_comes_before_another_users_item(
    client_user_b, db_session
):
    from app.models.database import Store
    from app.services.item_matching_service import ItemMatchingService
    from tests.services.test_item_matching import _receipt

    receipt, lines = await _receipt(db_session, "Limes", user_id=DEV_USER_ID)
    store = Store(name="Elsewhere", normalized_name="elsewhere")
    db_session.add(store)
    await db_session.flush()
    receipt.store_id = store.id
    await ItemMatchingService(db_session).match_line_items(DEV_USER_ID, lines)
    await db_session.flush()

    assert (await client_user_b.get("/api/users/me")).json()["is_premium"] is False
    await _assert_free_calls_are_403(
        client_user_b, lines[0].canonical_item_id, store.id
    )


async def test_a_mute_outlives_a_premium_lapse(
    client, db_session, mock_extractor, test_image_bytes, march_20
):
    """PREM-02 AC 3 (edge case EC-PI 5): a mute made
    while Premium still silences alerts after the lapse, is still listed, and
    can be removed; muting again needs Premium."""
    await set_premium(db_session, DEV_USER_ID, True)
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    item_id = await _item_id(client, "Organic Bananas")
    store_id = await _store_id(client)
    assert (await client.post(f"/api/items/{item_id}/mute")).status_code == 204
    assert (await client.post(f"/api/stores/{store_id}/mute")).status_code == 204

    await set_premium(db_session, DEV_USER_ID, False)
    assert (await client.get("/api/users/me")).json()["is_premium"] is False

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []
    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert [i["id"] for i in settings["muted_items"]] == [item_id]
    assert [s["id"] for s in settings["muted_stores"]] == [store_id]
    assert (await client.get(f"/api/items/{item_id}")).json()["alerts_muted"] is True

    # Removing the item mute leaves the store mute: still silent.
    assert (await client.delete(f"/api/items/{item_id}/mute")).status_code == 204
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.50)
    assert await _price_alerts(client) == []
    assert (await client.delete(f"/api/stores/{store_id}/mute")).status_code == 204
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-17", 1.50)
    assert len(await _price_alerts(client)) == 1

    _assert_premium_required(
        await client.post(f"/api/items/{item_id}/mute"), "price_alert_mute"
    )


async def test_a_refused_comparison_or_mute_sends_no_event(
    client,
    db_session,
    analytics_spy,  # noqa: F811
):
    """PREM-02 AC 7: price_comparison_viewed and price_alert_muted only on success."""
    item_id = await _free_user_with_an_item(client)
    store_id = (await client.get("/api/stores")).json()["stores"][0]["id"]
    await client.get(f"/api/items/{item_id}/compare")
    await client.post(f"/api/items/{item_id}/mute")
    await client.post(f"/api/stores/{store_id}/mute")
    names = [c[0] for c in analytics_spy.calls]
    assert "price_comparison_viewed" not in names
    assert "price_alert_muted" not in names

    await set_premium(db_session, DEV_USER_ID, True)
    await client.get(f"/api/items/{item_id}/compare")
    await client.post(f"/api/items/{item_id}/mute")
    await client.post(f"/api/stores/{store_id}/mute")
    names = [c[0] for c in analytics_spy.calls]
    assert names.count("price_comparison_viewed") == 1
    assert names.count("price_alert_muted") == 2


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


async def test_price_alerts_are_free(
    client, mock_extractor, test_image_bytes, march_20
):
    """PREM-02 AC 4: alerts, their settings and the alerts list stay free."""
    await _assert_free_user(client)
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert len(await _price_alerts(client)) == 1
    item_id = await _item_id(client, "Organic Bananas")
    for resp in (
        await client.get("/api/items/price-alert-settings"),
        await client.put(
            "/api/items/price-alert-settings",
            json={"enabled": True, "threshold_percent": 15},
        ),
        await client.delete(f"/api/items/{item_id}/mute"),
        await client.get("/api/notifications"),
        await client.get(f"/api/items/{item_id}/prices"),
    ):
        _assert_free(resp)


async def test_store_merge_is_free(client):
    """D3 store merge is not one of the D8 gates: a free user lists, merges and
    unmerges stores."""
    await _free_user_with_an_item(client)
    stores = (await client.get("/api/stores")).json()["stores"]
    ids = {s["name"]: s["id"] for s in stores}
    merged = await client.post(
        f"/api/stores/{ids['FreshCo']}/merge", json={"into_store_id": ids["Loblaws"]}
    )
    _assert_free(merged)
    unmerged = await client.delete(f"/api/stores/{ids['FreshCo']}/merge")
    assert unmerged.status_code == 204, unmerged.text


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
