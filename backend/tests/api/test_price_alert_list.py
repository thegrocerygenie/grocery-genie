"""PI-03 AC 5-9 (DA-4): the Price alerts list, the cooldown setting and the
alert copy from the design.

AC 8: the cooldown is the user's own setting (1-30 days; null is the server
default, ``GG_PRICE_ALERT_COOLDOWN_DAYS``), and the alert check uses it.
AC 9: "<Item> up N%" / "<Item> down N%", and "<Item> at <Store>: was $X avg,
now $Y", a drop adding "stock-up worth it"; the push and the in-app list read
the same. AC 5: ``GET /api/notifications?type=price_change&order=newest`` is
the list, and each alert's ``data`` carries what a row shows. Edge cases
EC-PI 9 (cooldown changes) and 11 (the list after a merge or split).
"""

import json
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models.database import Notification, User
from tests.api.test_items import _item_id
from tests.api.test_price_alerts import NOW, _buy, _history, _price_alerts, _store_id

pytestmark = pytest.mark.usefixtures("everyone_premium")

SETTINGS = "/api/items/price-alert-settings"


@pytest.fixture(autouse=True)
def pinned_now(monkeypatch) -> list:
    from app.core import clock

    now = [NOW]
    monkeypatch.setattr(clock, "now", lambda: now[0])
    return now


async def _list(client, **params) -> list[dict]:
    resp = await client.get(
        "/api/notifications",
        params={"type": "price_change", "order": "newest", "per_page": 100, **params},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


# --- AC 8: cooldown as a user setting ----------------------------------------


async def test_the_cooldown_starts_at_the_default(client):
    resp = await client.get(SETTINGS)

    assert resp.status_code == 200, resp.text
    assert resp.json()["cooldown_days"] == 7
    assert resp.json()["default_cooldown_days"] == 7


async def test_the_default_cooldown_is_a_setting(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "price_alert_cooldown_days", 3)

    body = (await client.get(SETTINGS)).json()
    assert body["cooldown_days"] == 3
    assert body["default_cooldown_days"] == 3


@pytest.mark.parametrize("days", [1, 3, 7, 14, 30])
async def test_the_user_can_set_their_own_cooldown(client, days):
    resp = await client.put(SETTINGS, json={"cooldown_days": days})

    assert resp.status_code == 200, resp.text
    assert resp.json()["cooldown_days"] == days
    assert (await client.get(SETTINGS)).json()["cooldown_days"] == days


async def test_a_null_cooldown_goes_back_to_the_default(client):
    await client.put(SETTINGS, json={"cooldown_days": 14})

    resp = await client.put(SETTINGS, json={"cooldown_days": None})

    assert resp.status_code == 200, resp.text
    assert resp.json()["cooldown_days"] == 7


async def test_leaving_the_cooldown_out_keeps_it(client):
    await client.put(SETTINGS, json={"cooldown_days": 14})

    resp = await client.put(SETTINGS, json={"threshold_percent": 20})

    assert resp.json()["cooldown_days"] == 14


@pytest.mark.parametrize("bad", [0, 31, -1, 365, "a week", 2.5])
async def test_the_cooldown_must_be_1_to_30_days(client, bad):
    await client.put(SETTINGS, json={"cooldown_days": 14})

    resp = await client.put(SETTINGS, json={"cooldown_days": bad})

    assert resp.status_code == 422
    assert (await client.get(SETTINGS)).json()["cooldown_days"] == 14


async def test_the_alert_check_uses_the_users_cooldown(
    client, mock_extractor, test_image_bytes, pinned_now
):
    await client.put(SETTINGS, json={"cooldown_days": 3})
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    assert len(await _price_alerts(client)) == 1

    pinned_now[0] = NOW + timedelta(days=2, hours=23)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.60)
    assert len(await _price_alerts(client)) == 1

    pinned_now[0] = NOW + timedelta(days=3)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-17", 1.70)
    assert len(await _price_alerts(client)) == 2


async def test_the_cooldown_is_the_callers_own(client_user_b, db_session):
    """User A's cooldown is A's: B reads and writes only B's own."""
    from tests.conftest import DEV_USER_ID, ensure_user

    await ensure_user(db_session, DEV_USER_ID)
    user_a = await db_session.get(User, DEV_USER_ID)
    user_a.price_alert_cooldown_days = 14
    await db_session.flush()

    assert (await client_user_b.get(SETTINGS)).json()["cooldown_days"] == 7
    resp = await client_user_b.put(SETTINGS, json={"cooldown_days": 1})
    assert resp.json()["cooldown_days"] == 1

    await db_session.refresh(user_a)
    assert user_a.price_alert_cooldown_days == 14


# --- EC-PI 9: cooldown setting changes --------------------------------------


async def test_a_longer_cooldown_counts_from_the_last_alert(
    client, mock_extractor, test_image_bytes, pinned_now
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    await client.put(SETTINGS, json={"cooldown_days": 14})

    pinned_now[0] = NOW + timedelta(days=8)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.60)
    assert len(await _price_alerts(client)) == 1

    pinned_now[0] = NOW + timedelta(days=14)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-17", 1.70)
    assert len(await _price_alerts(client)) == 2


async def test_shortening_the_cooldown_never_resends_a_held_back_alert(
    client, mock_extractor, test_image_bytes, pinned_now
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    pinned_now[0] = NOW + timedelta(days=2)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.60)
    assert len(await _price_alerts(client)) == 1  # held back by the 7 days

    await client.put(SETTINGS, json={"cooldown_days": 1})

    # The held-back price is not sent now, nor at the next confirm.
    assert len(await _price_alerts(client)) == 1
    pinned_now[0] = NOW + timedelta(days=2, hours=1)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-17", 1.70)
    alerts = await _list(client)
    # The held-back $1.60 is never sent; the next change ($1.70) is. (Not by
    # position: on Postgres the test's one transaction gives both the same
    # created_at.)
    bodies = sorted(a["body"] for a in alerts)
    assert len(bodies) == 2
    assert any("now $1.70/lb" in b for b in bodies)
    assert not any("now $1.60/lb" in b for b in bodies)


# --- AC 9: alert copy per design --------------------------------------------


async def test_a_rise_reads_was_avg_now(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 0.60, 0.70)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 0.78)

    [alert] = await _price_alerts(client)
    assert alert["title"] == "Organic Bananas up 20%"
    assert alert["body"] == (
        "Organic Bananas at Loblaws: was $0.65/lb avg, now $0.78/lb"
    )
    assert "stock-up" not in alert["body"]


async def test_a_drop_adds_stock_up_worth_it(client, mock_extractor, test_image_bytes):
    await _history(client, mock_extractor, test_image_bytes, 2.00, 2.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.72)

    [alert] = await _price_alerts(client)
    assert alert["title"] == "Organic Bananas down 14%"
    assert alert["body"] == (
        "Organic Bananas at Loblaws: was $2.00/lb avg, now $1.72/lb · stock-up worth it"
    )


async def test_a_counted_price_has_no_unit(client, mock_extractor, test_image_bytes):
    for day, price in [("2026-03-01", 4.49), ("2026-03-02", 4.49)]:
        await _buy(
            client, mock_extractor, test_image_bytes, day, price, name="Eggs", unit=None
        )
    await _buy(
        client,
        mock_extractor,
        test_image_bytes,
        "2026-03-15",
        5.49,
        name="Eggs",
        unit=None,
        store="Loblaws",
    )

    [alert] = await _price_alerts(client)
    assert alert["title"] == "Eggs up 22%"
    assert alert["body"] == "Eggs at Loblaws: was $4.49 avg, now $5.49"


async def test_a_half_cent_average_rounds_half_up_like_the_sparkline(
    client, mock_extractor, test_image_bytes
):
    # An average of $1.005: the text rounds half up, as recent_prices do,
    # never down by binary float ("$1.00").
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.01)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.25)

    [alert] = await _list(client)
    assert json.loads(alert["data"])["old_average"] == "$1.01/lb"
    assert "was $1.01/lb avg" in alert["body"]


async def test_the_alert_data_carries_what_the_list_row_shows(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 2.00, 2.10)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.72)

    [alert] = await _list(client)
    assert json.loads(alert["data"]) == {
        "canonical_item_id": await _item_id(client, "Organic Bananas"),
        "store_id": await _store_id(client),
        "item_name": "Organic Bananas",
        "store_name": "Loblaws",
        "direction": "down",
        "percent": -16,
        "old_average": "$2.05/lb",
        "new_price": "$1.72/lb",
        # The item's like-for-like prices up to this one, oldest first.
        "recent_prices": [2.0, 2.1, 1.72],
    }


async def test_the_sparkline_holds_at_most_the_last_eight_prices(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, *([1.00] * 9), 1.01)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-20", 1.50)

    [alert] = await _list(client)
    assert json.loads(alert["data"])["recent_prices"] == [
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.01,
        1.5,
    ]


# --- AC 5: the list ------------------------------------------------------------


async def test_the_list_holds_only_price_alerts_newest_first(
    client, mock_extractor, test_image_bytes, db_session, pinned_now
):
    from tests.conftest import DEV_USER_ID

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
    pinned_now[0] = NOW + timedelta(days=8)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-16", 1.80)
    db_session.add(
        Notification(
            user_id=DEV_USER_ID, type="budget_threshold", title="Budget", body="b"
        )
    )
    await db_session.flush()
    # Mark the newer one read: the list stays newest first all the same.
    rows = (
        (
            await db_session.execute(
                select(Notification)
                .where(Notification.type == "price_change")
                .order_by(Notification.created_at)
            )
        )
        .scalars()
        .all()
    )
    rows[0].created_at = NOW
    rows[1].created_at = NOW + timedelta(days=8)
    rows[1].read = True
    await db_session.flush()

    alerts = await _list(client)

    assert [a["type"] for a in alerts] == ["price_change", "price_change"]
    assert "now $1.80/lb" in alerts[0]["body"]
    assert "now $1.50/lb" in alerts[1]["body"]
    resp = await client.get(
        "/api/notifications", params={"type": "price_change", "order": "newest"}
    )
    assert resp.json()["total"] == 2


async def test_an_unknown_order_is_422(client):
    resp = await client.get("/api/notifications", params={"order": "oldest"})

    assert resp.status_code == 422


async def test_the_list_is_the_callers_own(client_user_b, db_session):
    from tests.conftest import DEV_USER_ID, ensure_user

    await ensure_user(db_session, DEV_USER_ID)
    db_session.add(
        Notification(
            user_id=DEV_USER_ID,
            type="price_change",
            title="Milk up 20%",
            body="Milk at FreshCo: was $4.00 avg, now $4.80",
        )
    )
    await db_session.flush()

    assert await _list(client_user_b) == []


# --- EC-PI 11: the list after a merge or split ------------------------------


async def test_an_alert_for_a_merged_item_opens_the_item_it_went_into(
    client, mock_extractor, test_image_bytes, db_session
):
    from app.tasks.push_tasks import push_data

    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
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

    resp = await client.post(
        f"/api/items/{bananas}/merge", json={"into_item_id": apples}
    )
    assert resp.status_code == 200, resp.text

    [alert] = await _list(client)
    data = json.loads(alert["data"])
    assert data["canonical_item_id"] == apples
    assert data["item_name"] == "Organic Bananas"  # the alert as it was sent
    row = (
        await db_session.execute(
            select(Notification).where(Notification.id == uuid.UUID(alert["id"]))
        )
    ).scalar_one()
    assert push_data(row)["url"] == f"/items/{apples}"


async def test_a_merge_never_touches_another_users_alerts(client, db_session):
    from tests.conftest import USER_B_ID, ensure_user

    await ensure_user(db_session, USER_B_ID)
    source, target = uuid.uuid4(), uuid.uuid4()
    theirs = Notification(
        user_id=USER_B_ID,
        type="price_change",
        title="Milk up 20%",
        body="Milk: was $4.00 avg, now $4.80",
        data=json.dumps({"canonical_item_id": str(source), "store_id": None}),
    )
    db_session.add(theirs)
    await db_session.flush()

    from app.services.item_matching_service import ItemMatchingService
    from tests.conftest import DEV_USER_ID

    await ItemMatchingService(db_session)._move_price_alerts(
        DEV_USER_ID, source, target
    )
    # Flush first: refresh would drop an unflushed change and prove nothing.
    await db_session.flush()

    await db_session.refresh(theirs)
    assert json.loads(theirs.data)["canonical_item_id"] == str(source)


async def test_an_alert_stays_listed_after_its_item_is_split(
    client, mock_extractor, test_image_bytes
):
    await _history(client, mock_extractor, test_image_bytes, 1.00, 1.00)
    await _buy(client, mock_extractor, test_image_bytes, "2026-03-15", 1.50)
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
    await client.post(f"/api/items/{apples}/merge", json={"into_item_id": bananas})
    detail = (await client.get(f"/api/items/{bananas}")).json()
    [alias] = [a for a in detail["aliases"] if a["alias"] == "Gala Apples"]
    [before] = await _list(client)

    resp = await client.post(f"/api/items/{bananas}/aliases/{alias['id']}/split")
    assert resp.status_code in (200, 201), resp.text

    [after] = await _list(client)
    assert after == before
    assert json.loads(after["data"])["canonical_item_id"] == bananas
