"""PI-03 price change alerts through the API.

A confirmed price at least the threshold (10% by default) away from the
item's 30-day rolling average sends one ``price_change`` notification, at
most once per item per cooldown (7 days), unless the item or store is muted.
Receipts are confirmed the way the app does it: scan, then PATCH status.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core import clock
from app.models.database import Notification, PriceAlertSent
from tests.api.test_items import _item_id, _scan_and_confirm

NOW = datetime(2026, 3, 20, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def pinned_now(monkeypatch) -> list[datetime]:
    """The cooldown runs on the wall clock; tests move it with ``now[0]``."""
    now = [NOW]
    monkeypatch.setattr(clock, "now", lambda: now[0])
    return now


async def _buy(client, mock_extractor, image, day, price, *, store="Loblaws", **kw):
    unit = kw.get("unit", "lb")
    name = kw.get("name", "Organic Bananas")
    return await _scan_and_confirm(
        client, mock_extractor, image, store, day, (name, 2, price, unit)
    )


async def _history(client, mock_extractor, image, *prices, store="Loblaws"):
    """Prices bought on 1, 2, 3 ... March: the item's rolling average."""
    for day, price in enumerate(prices, start=1):
        await _buy(
            client, mock_extractor, image, f"2026-03-{day:02d}", price, store=store
        )


async def _store_id(client: AsyncClient, store_name: str = "Loblaws") -> str:
    item_id = await _item_id(client, "Organic Bananas")
    resp = await client.get(f"/api/items/{item_id}/prices")
    assert resp.status_code == 200, resp.text
    return next(
        o["store_id"]
        for o in resp.json()["observations"]
        if o["store_name"] == store_name
    )


async def _price_alerts(client: AsyncClient) -> list[dict]:
    resp = await client.get("/api/notifications", params={"per_page": 100})
    assert resp.status_code == 200, resp.text
    return [n for n in resp.json()["items"] if n["type"] == "price_change"]


# --- AC 1: >= 10% from the rolling average, configurable --------------------


async def test_a_ten_percent_rise_from_the_rolling_average_alerts(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    assert await _price_alerts(client) == []

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.10)

    [alert] = await _price_alerts(client)
    assert "up 10%" in alert["body"]


async def test_a_change_under_the_threshold_does_not_alert(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.09)

    assert await _price_alerts(client) == []


async def test_a_ten_percent_drop_alerts(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 2.00, 2.00)

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.80)

    [alert] = await _price_alerts(client)
    assert "down 10%" in alert["body"]


async def test_the_user_can_set_their_own_threshold(
    client, mock_extractor, test_image_bytes
):
    resp = await client.get("/api/items/price-alert-settings")
    assert resp.status_code == 200, resp.text
    assert resp.json()["threshold_percent"] == 10
    assert resp.json()["default_threshold_percent"] == 10

    resp = await client.put(
        "/api/items/price-alert-settings", json={"threshold_percent": 20}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["threshold_percent"] == 20

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.15)
    assert await _price_alerts(client) == []

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.30)
    assert len(await _price_alerts(client)) == 1


async def test_a_null_threshold_goes_back_to_the_default(client):
    await client.put("/api/items/price-alert-settings", json={"threshold_percent": 25})

    resp = await client.put(
        "/api/items/price-alert-settings", json={"threshold_percent": None}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["threshold_percent"] == 10


@pytest.mark.parametrize("bad", [0, 101, -5])
async def test_threshold_must_be_1_to_100(client, bad):
    resp = await client.put(
        "/api/items/price-alert-settings", json={"threshold_percent": bad}
    )
    assert resp.status_code == 422


async def test_the_default_threshold_is_a_setting(
    client, mock_extractor, test_image_bytes, monkeypatch
):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "price_alert_threshold_percent", 30)
    resp = await client.get("/api/items/price-alert-settings")
    assert resp.json()["threshold_percent"] == 30

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.25)

    assert await _price_alerts(client) == []


async def test_turning_price_alerts_off_stops_them(
    client, mock_extractor, test_image_bytes
):
    resp = await client.put("/api/items/price-alert-settings", json={"enabled": False})
    assert resp.status_code == 200, resp.text
    assert resp.json()["enabled"] is False

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 2.00)

    assert await _price_alerts(client) == []


async def test_one_earlier_price_is_not_yet_an_average(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 1.00)

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 2.00)

    assert await _price_alerts(client) == []


async def test_the_average_covers_the_last_30_days(
    client, mock_extractor, test_image_bytes
):
    # Two cheap prices in January fall outside the 30-day window, so March
    # has only one earlier price: no average yet.
    await _buy(client, mock_extractor, test_image_bytes, "2026-01-05", 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-01-06", 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-01", 2.00)

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 2.00)

    assert await _price_alerts(client) == []


async def test_only_like_for_like_prices_make_the_average(
    client, mock_extractor, test_image_bytes
):
    # Per-kg prices and a price in another unit are not compared with per-lb.
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-10", 3.00, unit="kg")
    assert await _price_alerts(client) == []

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.05)

    assert await _price_alerts(client) == []


async def test_a_manual_entry_alerts_too(client, mock_extractor, test_image_bytes):
    for day in ("2026-03-01", "2026-03-02"):
        resp = await client.post(
            "/api/receipts",
            json={
                "store_name": "FreshCo",
                "date": day,
                "total": 4.0,
                "items": [
                    {
                        "name": "Milk",
                        "quantity": 1,
                        "unit_price": 4.0,
                        "total_price": 4.0,
                    }
                ],
            },
        )
        assert resp.status_code == 201, resp.text
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "FreshCo",
            "date": "2026-03-10",
            "total": 5.0,
            "items": [
                {"name": "Milk", "quantity": 1, "unit_price": 5.0, "total_price": 5.0}
            ],
        },
    )
    assert resp.status_code == 201, resp.text

    [alert] = await _price_alerts(client)
    assert "Milk" in alert["body"]


# --- AC 2: item, store, old average, new price, percent ---------------------


async def test_the_alert_names_item_store_average_new_price_and_percent(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 0.60, 0.70)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 0.78)

    [alert] = await _price_alerts(client)
    body = alert["body"]
    assert "Organic Bananas" in body
    assert "Loblaws" in body
    assert "$0.65/lb" in body  # the 30-day average
    assert "$0.78/lb" in body  # the new price
    assert "up 20%" in body
    item_id = await _item_id(client, "Organic Bananas")
    assert json.loads(alert["data"]) == {
        "canonical_item_id": item_id,
        "store_id": await _store_id(client),
    }


async def test_the_alert_dispatches_price_change_detected(
    client, mock_extractor, test_image_bytes, monkeypatch
):
    from app.events.dispatcher import dispatcher
    from app.events.types import PriceChangeDetected

    seen: list = []
    original = dispatcher.dispatch
    monkeypatch.setattr(dispatcher, "dispatch", lambda e: (seen.append(e), original(e)))
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)

    [event] = [e for e in seen if isinstance(e, PriceChangeDetected)]
    assert event.old_avg == pytest.approx(1.00)
    assert event.new_price == pytest.approx(1.50)
    assert event.percent_change == pytest.approx(50.0)
    assert str(event.canonical_item_id) == await _item_id(client, "Organic Bananas")


# --- AC 3: cooldown per item ---------------------------------------------------


async def test_an_item_alerts_once_per_cooldown(
    client, mock_extractor, test_image_bytes, pinned_now
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert len(await _price_alerts(client)) == 1

    pinned_now[0] = NOW + timedelta(days=6, hours=23)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.60)
    assert len(await _price_alerts(client)) == 1

    pinned_now[0] = NOW + timedelta(days=7)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-17", 1.70)
    assert len(await _price_alerts(client)) == 2


async def test_the_cooldown_is_per_item(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    for day in (5, 6):
        await _buy(
            client,
            mock_extractor,
            test_image_bytes,
            f"2026-03-{day:02d}",
            3.00,
            name="Whole Milk",
            unit=None,
        )
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)

    await _buy(
        client,
        mock_extractor,
        test_image_bytes,
        "2026-03-16",
        4.00,
        name="Whole Milk",
        unit=None,
    )

    assert len(await _price_alerts(client)) == 2


async def test_claiming_twice_inside_the_cooldown_sends_once(
    client, db_session, mock_extractor, test_image_bytes
):
    from app.services.price_alert_service import PriceAlertService
    from tests.conftest import DEV_USER_ID

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    item_id = uuid.UUID(await _item_id(client, "Organic Bananas"))
    service = PriceAlertService(db_session)

    assert await service.claim(DEV_USER_ID, item_id, NOW) is True
    assert await service.claim(DEV_USER_ID, item_id, NOW + timedelta(days=1)) is False
    assert await service.claim(DEV_USER_ID, item_id, NOW + timedelta(days=7)) is True
    rows = (
        (
            await db_session.execute(
                select(PriceAlertSent).where(
                    PriceAlertSent.canonical_item_id == item_id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1


# --- AC 4: mute per item or per store ---------------------------------------


async def test_a_muted_item_does_not_alert(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    item_id = await _item_id(client, "Organic Bananas")

    resp = await client.post(f"/api/items/{item_id}/mute")
    assert resp.status_code == 204, resp.text
    detail = await client.get(f"/api/items/{item_id}")
    assert detail.json()["alerts_muted"] is True

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []

    resp = await client.delete(f"/api/items/{item_id}/mute")
    assert resp.status_code == 204, resp.text
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.50)
    assert len(await _price_alerts(client)) == 1


async def test_a_muted_store_does_not_alert(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    store_id = await _store_id(client)

    resp = await client.post(f"/api/stores/{store_id}/mute")
    assert resp.status_code == 204, resp.text
    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_stores"] == [{"id": store_id, "name": "Loblaws"}]

    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert await _price_alerts(client) == []

    # The same item at another store still alerts.
    await _buy(
        client, mock_extractor, test_image_bytes, "2026-03-16", 1.50, store="FreshCo"
    )
    assert len(await _price_alerts(client)) == 1

    resp = await client.delete(f"/api/stores/{store_id}/mute")
    assert resp.status_code == 204, resp.text
    assert (await client.get("/api/items/price-alert-settings")).json()[
        "muted_stores"
    ] == []


async def test_muting_twice_is_fine(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 1.00)
    item_id = await _item_id(client, "Organic Bananas")

    assert (await client.post(f"/api/items/{item_id}/mute")).status_code == 204
    assert (await client.post(f"/api/items/{item_id}/mute")).status_code == 204
    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_items"] == [
        {"id": item_id, "canonical_name": "Organic Bananas"}
    ]
    assert (await client.delete(f"/api/items/{item_id}/mute")).status_code == 204
    assert (await client.delete(f"/api/items/{item_id}/mute")).status_code == 204


async def test_muting_an_unknown_item_or_store_is_404(client):
    unknown = uuid.uuid4()
    assert (await client.post(f"/api/items/{unknown}/mute")).status_code == 404
    assert (await client.post(f"/api/stores/{unknown}/mute")).status_code == 404


async def test_a_store_the_user_never_shopped_at_cannot_be_muted(client, db_session):
    from app.models.database import Store

    store = Store(name="Elsewhere", normalized_name="elsewhere")
    db_session.add(store)
    await db_session.flush()

    assert (await client.post(f"/api/stores/{store.id}/mute")).status_code == 404


async def test_merging_a_muted_item_keeps_the_mute(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(
        client,
        mock_extractor,
        test_image_bytes,
        "2026-03-05",
        1.00,
        name="Gala Apples",
        unit=None,
    )
    bananas = await _item_id(client, "Organic Bananas")
    apples = await _item_id(client, "Gala Apples")
    await client.post(f"/api/items/{apples}/mute")

    resp = await client.post(
        f"/api/items/{apples}/merge", json={"into_item_id": bananas}
    )
    assert resp.status_code == 200, resp.text

    assert (await client.get(f"/api/items/{bananas}")).json()["alerts_muted"] is True


async def test_the_alert_is_pushed_with_a_link_to_the_item(
    client, mock_extractor, test_image_bytes, db_session
):
    from app.tasks.push_tasks import push_data

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    item_id = await _item_id(client, "Organic Bananas")
    notification = (
        await db_session.execute(
            select(Notification).where(Notification.type == "price_change")
        )
    ).scalar_one()

    data = push_data(notification)

    assert data["type"] == "price_change"
    assert data["url"] == f"/items/{item_id}"
    assert data["canonical_item_id"] == item_id
