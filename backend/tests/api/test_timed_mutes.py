"""Timed price alert mutes (PI-03 AC 10-12, DA-7; edge cases EC-PI 4, 5).

``POST /api/items/{id}/mute`` and ``POST /api/stores/{id}/mute`` take an
optional ``{"until": <ISO 8601>}``: none or null is forever, a time not in
the future is 422, and muting again replaces the time. A timed mute ends by
itself: the alert check compares ``muted_until`` with the server clock (UTC)
when the receipt is confirmed, so no job is needed to end it.
"""

import json
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core import clock
from tests.api.test_items import _item_id
from tests.api.test_price_alerts import (
    NOW,
    _buy,
    _history,
    _price_alerts,
    _store_id,
)
from tests.conftest import DEV_USER_ID, set_premium

WEEK = NOW + timedelta(days=7)


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


@pytest.fixture(autouse=True)
async def premium(client, db_session) -> None:
    """Muting is Premium (PREM-02); the stored entitlement, so a test can
    let it lapse. The first request signs the test user up."""
    assert (await client.get("/api/users/me")).status_code == 200
    await set_premium(db_session, DEV_USER_ID, True)


@pytest.fixture(autouse=True)
def pinned_now(monkeypatch) -> list[datetime]:
    now = [NOW]
    monkeypatch.setattr(clock, "now", lambda: now[0])
    return now


async def _settings(client: AsyncClient) -> dict:
    resp = await client.get("/api/items/price-alert-settings")
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _detail(client: AsyncClient, item_id: str) -> dict:
    resp = await client.get(f"/api/items/{item_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _bananas(client, mock_extractor, image) -> tuple[str, str]:
    await _history(client, mock_extractor, image, 1.00, 1.00)
    return await _item_id(client, "Organic Bananas"), await _store_id(client)


# --- AC 11: the API ----------------------------------------------------------


async def test_a_mute_takes_an_until_and_returns_it(
    client, mock_extractor, test_image_bytes
):
    item_id, store_id = await _bananas(client, mock_extractor, test_image_bytes)

    resp = await client.post(f"/api/items/{item_id}/mute", json={"until": _iso(WEEK)})
    assert resp.status_code == 204, resp.text
    resp = await client.post(
        f"/api/stores/{store_id}/mute", json={"until": _iso(WEEK + timedelta(days=1))}
    )
    assert resp.status_code == 204, resp.text

    detail = await _detail(client, item_id)
    assert detail["alerts_muted"] is True
    assert detail["muted_until"] == _iso(WEEK)
    settings = await _settings(client)
    assert settings["muted_items"] == [
        {
            "id": item_id,
            "canonical_name": "Organic Bananas",
            "muted_until": _iso(WEEK),
        }
    ]
    assert settings["muted_stores"] == [
        {
            "id": store_id,
            "name": "Loblaws",
            "muted_until": _iso(WEEK + timedelta(days=1)),
        }
    ]


async def test_no_body_or_a_null_until_is_forever(
    client, mock_extractor, test_image_bytes
):
    item_id, store_id = await _bananas(client, mock_extractor, test_image_bytes)

    assert (await client.post(f"/api/items/{item_id}/mute")).status_code == 204
    resp = await client.post(f"/api/stores/{store_id}/mute", json={"until": None})
    assert resp.status_code == 204, resp.text

    detail = await _detail(client, item_id)
    assert detail["alerts_muted"] is True and detail["muted_until"] is None
    settings = await _settings(client)
    assert settings["muted_items"][0]["muted_until"] is None
    assert settings["muted_stores"][0]["muted_until"] is None


@pytest.mark.parametrize(
    "until",
    [_iso(NOW), _iso(NOW - timedelta(seconds=1)), "2020-01-01T00:00:00Z", "soon"],
)
async def test_an_until_not_in_the_future_is_422(
    client, mock_extractor, test_image_bytes, until
):
    item_id, store_id = await _bananas(client, mock_extractor, test_image_bytes)

    for path in (f"/api/items/{item_id}/mute", f"/api/stores/{store_id}/mute"):
        resp = await client.post(path, json={"until": until})
        assert resp.status_code == 422, resp.text
    assert (await _detail(client, item_id))["alerts_muted"] is False
    settings = await _settings(client)
    assert settings["muted_items"] == [] and settings["muted_stores"] == []


async def test_muting_again_replaces_the_time(client, mock_extractor, test_image_bytes):
    item_id, store_id = await _bananas(client, mock_extractor, test_image_bytes)
    later = WEEK + timedelta(days=30)

    for path in (f"/api/items/{item_id}/mute", f"/api/stores/{store_id}/mute"):
        assert (await client.post(path, json={"until": _iso(WEEK)})).status_code == 204
        assert (await client.post(path, json={"until": _iso(later)})).status_code == 204
    settings = await _settings(client)
    assert [i["muted_until"] for i in settings["muted_items"]] == [_iso(later)]
    assert [s["muted_until"] for s in settings["muted_stores"]] == [_iso(later)]

    # Shorter again, then forever.
    for path in (f"/api/items/{item_id}/mute", f"/api/stores/{store_id}/mute"):
        assert (await client.post(path, json={"until": _iso(WEEK)})).status_code == 204
    settings = await _settings(client)
    assert [i["muted_until"] for i in settings["muted_items"]] == [_iso(WEEK)]
    assert [s["muted_until"] for s in settings["muted_stores"]] == [_iso(WEEK)]
    for path in (f"/api/items/{item_id}/mute", f"/api/stores/{store_id}/mute"):
        assert (await client.post(path)).status_code == 204
    settings = await _settings(client)
    assert [i["muted_until"] for i in settings["muted_items"]] == [None]
    assert [s["muted_until"] for s in settings["muted_stores"]] == [None]


async def test_an_until_with_an_offset_is_kept_in_utc(
    client, mock_extractor, test_image_bytes, pinned_now
):
    """EC-PI 4: times are stored in UTC. 14:00 at +02:00 is 12:00 UTC, on
    SQLite (which keeps no offset) as on Postgres."""
    item_id, _ = await _bananas(client, mock_extractor, test_image_bytes)

    resp = await client.post(
        f"/api/items/{item_id}/mute", json={"until": "2026-03-27T14:00:00+02:00"}
    )
    assert resp.status_code == 204, resp.text
    assert (await _detail(client, item_id))["muted_until"] == "2026-03-27T12:00:00Z"

    pinned_now[0] = datetime(2026, 3, 27, 11, 59, tzinfo=UTC)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []
    pinned_now[0] = datetime(2026, 3, 27, 12, 0, tzinfo=UTC)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.50)
    assert len(await _price_alerts(client)) == 1


# --- AC 12 and EC-PI 4: a timed mute ends by itself ------------------------


async def test_a_timed_item_mute_ends_by_itself(
    client, mock_extractor, test_image_bytes, pinned_now
):
    item_id, _ = await _bananas(client, mock_extractor, test_image_bytes)
    assert (
        await client.post(f"/api/items/{item_id}/mute", json={"until": _iso(WEEK)})
    ).status_code == 204

    # Muted: no alert, and the muted price claims no cooldown.
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    pinned_now[0] = WEEK - timedelta(seconds=1)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.50)
    assert await _price_alerts(client) == []
    assert (await _detail(client, item_id))["alerts_muted"] is True

    # At until the mute is over: not listed, and nothing is sent for the
    # prices confirmed during it, even when another receipt is confirmed.
    pinned_now[0] = WEEK
    assert (await _detail(client, item_id))["alerts_muted"] is False
    assert (await _detail(client, item_id))["muted_until"] is None
    assert (await _settings(client))["muted_items"] == []
    await _buy(
        client,
        mock_extractor,
        test_image_bytes,
        "2026-03-17",
        2.00,
        name="Gala Apples",
        unit=None,
    )
    assert await _price_alerts(client) == []

    # The next price of the item alerts at once (no cooldown was used).
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-18", 2.00)
    [alert] = await _price_alerts(client)
    assert json.loads(alert["data"])["canonical_item_id"] == item_id


async def test_a_timed_store_mute_ends_by_itself(
    client, mock_extractor, test_image_bytes, pinned_now
):
    _, store_id = await _bananas(client, mock_extractor, test_image_bytes)
    assert (
        await client.post(f"/api/stores/{store_id}/mute", json={"until": _iso(WEEK)})
    ).status_code == 204

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []

    pinned_now[0] = WEEK + timedelta(hours=1)
    assert (await _settings(client))["muted_stores"] == []
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.60)
    assert len(await _price_alerts(client)) == 1


async def test_an_ended_mute_can_still_be_removed(
    client, mock_extractor, test_image_bytes, pinned_now
):
    item_id, store_id = await _bananas(client, mock_extractor, test_image_bytes)
    for path in (f"/api/items/{item_id}/mute", f"/api/stores/{store_id}/mute"):
        assert (await client.post(path, json={"until": _iso(WEEK)})).status_code == 204
    pinned_now[0] = WEEK + timedelta(days=1)

    assert (await client.delete(f"/api/items/{item_id}/mute")).status_code == 204
    assert (await client.delete(f"/api/stores/{store_id}/mute")).status_code == 204


async def test_muting_an_ended_mute_again_starts_a_new_one(
    client, mock_extractor, test_image_bytes, pinned_now
):
    item_id, _ = await _bananas(client, mock_extractor, test_image_bytes)
    path = f"/api/items/{item_id}/mute"
    assert (await client.post(path, json={"until": _iso(WEEK)})).status_code == 204
    pinned_now[0] = WEEK + timedelta(days=1)
    later = WEEK + timedelta(days=8)

    assert (await client.post(path, json={"until": _iso(later)})).status_code == 204

    assert (await _detail(client, item_id))["muted_until"] == _iso(later)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []


# --- EC-PI 5: a timed mute made while Premium runs to its end ---------------


async def test_a_timed_mute_runs_to_its_end_after_a_premium_lapse(
    client, db_session, mock_extractor, test_image_bytes, pinned_now
):
    item_id, _ = await _bananas(client, mock_extractor, test_image_bytes)
    path = f"/api/items/{item_id}/mute"
    assert (await client.post(path, json={"until": _iso(WEEK)})).status_code == 204

    await set_premium(db_session, DEV_USER_ID, False)

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []
    settings = await _settings(client)
    assert [i["muted_until"] for i in settings["muted_items"]] == [_iso(WEEK)]
    # Changing the time needs Premium, as muting does.
    later = {"until": _iso(WEEK + timedelta(days=30))}
    resp = await client.post(path, json=later)
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"]["code"] == "premium_required"
    assert (await client.post(path)).status_code == 403

    pinned_now[0] = WEEK
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.50)
    assert len(await _price_alerts(client)) == 1
    assert (await client.delete(path)).status_code == 204


# --- A merge keeps the longer mute; a split copies the time -----------------


async def _two_items(client, mock_extractor, image) -> tuple[str, str]:
    await _history(client, mock_extractor, image, 1.00, 1.00)
    await _buy(
        client, mock_extractor, image, "2026-03-05", 1.00, name="Gala Apples", unit=None
    )
    return (
        await _item_id(client, "Gala Apples"),
        await _item_id(client, "Organic Bananas"),
    )


async def _merge(client: AsyncClient, source: str, target: str) -> None:
    resp = await client.post(
        f"/api/items/{source}/merge", json={"into_item_id": target}
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize(
    ("source", "target", "kept"),
    [
        (WEEK, "none", WEEK),
        (WEEK, None, None),
        (None, WEEK, None),
        (WEEK, WEEK + timedelta(days=30), WEEK + timedelta(days=30)),
        (WEEK + timedelta(days=30), WEEK, WEEK + timedelta(days=30)),
    ],
)
async def test_a_merge_keeps_the_longer_mute(
    client, mock_extractor, test_image_bytes, source, target, kept
):
    """EC-PI 5: the mute moves with a merge; when both items are muted the
    longer one stays (forever is the longest)."""
    apples, bananas = await _two_items(client, mock_extractor, test_image_bytes)
    await client.post(
        f"/api/items/{apples}/mute", json={"until": source and _iso(source)}
    )
    if target != "none":
        await client.post(
            f"/api/items/{bananas}/mute", json={"until": target and _iso(target)}
        )

    resp = await client.post(
        f"/api/items/{apples}/merge", json={"into_item_id": bananas}
    )
    assert resp.status_code == 200, resp.text

    detail = await _detail(client, bananas)
    assert detail["alerts_muted"] is True
    assert detail["muted_until"] == (kept and _iso(kept))


async def test_a_merge_into_an_item_whose_mute_ended_takes_the_live_one(
    client, mock_extractor, test_image_bytes, pinned_now
):
    apples, bananas = await _two_items(client, mock_extractor, test_image_bytes)
    await client.post(f"/api/items/{bananas}/mute", json={"until": _iso(WEEK)})
    pinned_now[0] = WEEK + timedelta(days=1)
    later = WEEK + timedelta(days=10)
    await client.post(f"/api/items/{apples}/mute", json={"until": _iso(later)})

    resp = await client.post(
        f"/api/items/{apples}/merge", json={"into_item_id": bananas}
    )
    assert resp.status_code == 200, resp.text

    assert (await _detail(client, bananas))["muted_until"] == _iso(later)


async def test_a_merge_of_an_ended_mute_mutes_nothing(
    client, mock_extractor, test_image_bytes, pinned_now
):
    apples, bananas = await _two_items(client, mock_extractor, test_image_bytes)
    await client.post(f"/api/items/{apples}/mute", json={"until": _iso(WEEK)})
    pinned_now[0] = WEEK

    resp = await client.post(
        f"/api/items/{apples}/merge", json={"into_item_id": bananas}
    )
    assert resp.status_code == 200, resp.text

    assert (await _detail(client, bananas))["alerts_muted"] is False
    assert (await _settings(client))["muted_items"] == []


async def test_a_store_mute_again_replaces_the_time_across_the_group(
    client, mock_extractor, test_image_bytes
):
    """A mute covers the user's store group. Muting a group whose mute was
    recorded on a store since merged into another replaces that mute: one
    group, one time."""
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(
        client, mock_extractor, test_image_bytes, "2026-03-05", 1.00, store="FreshCo"
    )
    loblaws = await _store_id(client)
    freshco = await _store_id(client, "FreshCo")
    assert (await client.post(f"/api/stores/{freshco}/mute")).status_code == 204
    resp = await client.post(
        f"/api/stores/{freshco}/merge", json={"into_store_id": loblaws}
    )
    assert resp.status_code == 200, resp.text

    resp = await client.post(f"/api/stores/{loblaws}/mute", json={"until": _iso(WEEK)})
    assert resp.status_code == 204, resp.text

    assert [s["muted_until"] for s in (await _settings(client))["muted_stores"]] == [
        _iso(WEEK)
    ]
