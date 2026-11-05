"""Store normalization and user store merge through the API (EC Price
Intelligence 1, decision D3).

Branch numbers and punctuation normalize away for everyone; a user merges two
of their own stores to group them, which changes only how that user's prices
group: price history, item stats, cross-store comparison, price alerts and
store mutes. Comparison and mutes are Premium (D8), so every test runs as a
Premium user; the gates are in test_premium_gating.py.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.database import Notification, Store, UserStoreAlias
from tests.api.test_items import _item_id, analytics_spy  # noqa: F401
from tests.api.test_price_comparison import _compare, _manual
from tests.conftest import USER_B_ID, ensure_user

# Comparison and mutes are Premium (D8, PREM-02); these tests are about how
# they work, so every user is Premium. The gates: test_premium_gating.py.
pytestmark = pytest.mark.usefixtures("everyone_premium")


async def _stores(client: AsyncClient) -> list[dict]:
    resp = await client.get("/api/stores")
    assert resp.status_code == 200, resp.text
    return resp.json()["stores"]


async def _store_id(client: AsyncClient, name: str) -> str:
    return next(s["id"] for s in await _stores(client) if s["name"] == name)


async def _merge(client: AsyncClient, source: str, target: str) -> dict:
    resp = await client.post(
        f"/api/stores/{source}/merge", json={"into_store_id": target}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _two_banners(client: AsyncClient) -> tuple[str, str, str]:
    """Limes at Loblaws (twice) and at the Superstore (twice)."""
    for store, day, price in [
        ("Loblaws", "2026-03-01", 1.00),
        ("LOBLAWS #1234", "2026-03-08", 1.20),
        ("REAL CANADIAN SUPERSTORE", "2026-03-03", 0.80),
        ("Real Canadian Superstore - 1520", "2026-03-10", 0.60),
    ]:
        await _manual(client, store, day, "Limes", price)
    item_id = await _item_id(client, "limes")
    return (
        item_id,
        await _store_id(client, "Loblaws"),
        await _store_id(client, "REAL CANADIAN SUPERSTORE"),
    )


# --- normalization ------------------------------------------------------------


async def test_branch_numbers_normalize_into_one_store(client):
    item_id, loblaws, _ = await _two_banners(client)

    stores = await _stores(client)

    assert [(s["name"], s["receipt_count"]) for s in stores] == [
        ("Loblaws", 2),
        ("REAL CANADIAN SUPERSTORE", 2),
    ]
    assert all(s["merged_stores"] == [] for s in stores)
    compare = await _compare(client, item_id)
    assert {s["store_name"]: s["observation_count"] for s in compare["stores"]} == {
        "Loblaws": 2,
        "REAL CANADIAN SUPERSTORE": 2,
    }


async def test_the_store_list_leaves_out_deleted_receipts(client):
    receipt = await _manual(client, "FreshCo", "2026-03-01", "Limes", 1.0)
    await _manual(client, "Metro", "2026-03-01", "Limes", 1.0)
    resp = await client.delete(f"/api/receipts/{receipt['id']}")
    assert resp.status_code == 204, resp.text

    assert [s["name"] for s in await _stores(client)] == ["Metro"]


# --- merge: comparison, history, stats --------------------------------------


async def test_a_merged_store_compares_as_one_store(client):
    item_id, loblaws, rcss = await _two_banners(client)

    body = await _merge(client, rcss, loblaws)

    assert body["stores"] == [
        {
            "id": loblaws,
            "name": "Loblaws",
            "receipt_count": 4,
            "merged_stores": [{"id": rcss, "name": "REAL CANADIAN SUPERSTORE"}],
        }
    ]
    compare = await _compare(client, item_id)
    [store] = compare["stores"]
    assert store["store_id"] == loblaws
    assert store["store_name"] == "Loblaws"
    assert store["observation_count"] == 4
    assert store["avg_price"] == 0.90
    assert store["latest_price"] == 0.60
    assert store["latest_date"] == "2026-03-10"


async def test_a_merge_can_lift_stores_over_the_comparison_minimum(client):
    """stores_below_minimum counts groups: two one-price stores merged are one
    store with two prices."""
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.5)
    await _manual(client, "FreshCo", "2026-03-08", "Limes", 0.6)
    await _manual(client, "No Frills", "2026-03-02", "Limes", 0.4)
    await _manual(client, "NOFRILLS", "2026-03-09", "Limes", 0.4)
    item_id = await _item_id(client, "limes")
    before = await _compare(client, item_id)
    assert [s["store_name"] for s in before["stores"]] == ["FreshCo"]
    assert before["stores_below_minimum"] == 2

    await _merge(
        client,
        await _store_id(client, "NOFRILLS"),
        await _store_id(client, "No Frills"),
    )

    after = await _compare(client, item_id)
    assert [s["store_name"] for s in after["stores"]] == ["No Frills", "FreshCo"]
    assert after["stores_below_minimum"] == 0


async def test_price_history_and_stats_group_merged_stores(client):
    item_id, loblaws, rcss = await _two_banners(client)
    before = (await client.get(f"/api/items/{item_id}")).json()
    assert before["store_count"] == 2

    await _merge(client, rcss, loblaws)

    history = (await client.get(f"/api/items/{item_id}/prices")).json()
    assert history["store_count"] == 1
    assert {(o["store_id"], o["store_name"]) for o in history["observations"]} == {
        (loblaws, "Loblaws")
    }
    # Filtering by either store of the group gives the whole group.
    for store in (loblaws, rcss):
        filtered = (
            await client.get(f"/api/items/{item_id}/prices", params={"store": store})
        ).json()
        assert len(filtered["observations"]) == 4
    assert (await client.get(f"/api/items/{item_id}")).json()["store_count"] == 1
    [listed] = (await client.get("/api/items")).json()["items"]
    assert listed["store_count"] == 1
    # The latest price (at the Superstore) names the merged store.
    assert listed["latest_price"]["store_name"] == "Loblaws"
    detail = (await client.get(f"/api/items/{item_id}")).json()
    assert detail["latest_price"]["store_name"] == "Loblaws"


async def test_unmerge_splits_the_stores_again(client, analytics_spy):  # noqa: F811
    item_id, loblaws, rcss = await _two_banners(client)
    await _merge(client, rcss, loblaws)

    resp = await client.delete(f"/api/stores/{rcss}/merge")

    assert resp.status_code == 204, resp.text
    assert [s["name"] for s in await _stores(client)] == [
        "Loblaws",
        "REAL CANADIAN SUPERSTORE",
    ]
    assert len((await _compare(client, item_id))["stores"]) == 2
    # Idempotent.
    assert (await client.delete(f"/api/stores/{rcss}/merge")).status_code == 204
    events = [(name, props) for name, props, _ in analytics_spy.calls]
    assert ("store_merged", {}) in events
    assert ("store_unmerged", {}) in events


async def test_merging_into_the_same_store_is_409(client):
    _, loblaws, rcss = await _two_banners(client)
    await _merge(client, rcss, loblaws)

    for source, target in [(loblaws, loblaws), (rcss, loblaws), (loblaws, rcss)]:
        resp = await client.post(
            f"/api/stores/{source}/merge", json={"into_store_id": target}
        )
        assert resp.status_code == 409, resp.text


async def test_merging_a_store_the_user_never_shopped_at_is_404(client, db_session):
    _, loblaws, _ = await _two_banners(client)
    elsewhere = Store(name="Elsewhere", normalized_name="elsewhere")
    db_session.add(elsewhere)
    await db_session.flush()

    for source, target in [
        (str(elsewhere.id), loblaws),
        (loblaws, str(elsewhere.id)),
        (str(uuid.uuid4()), loblaws),
    ]:
        resp = await client.post(
            f"/api/stores/{source}/merge", json={"into_store_id": target}
        )
        assert resp.status_code == 404, resp.text


async def test_merge_needs_a_target(client):
    _, loblaws, _ = await _two_banners(client)
    resp = await client.post(f"/api/stores/{loblaws}/merge", json={})
    assert resp.status_code == 422


async def test_another_users_merge_never_changes_my_grouping(client, db_session):
    """D3: a merge is a per-user alias, never a change to the shared row."""
    item_id, loblaws, rcss = await _two_banners(client)
    await ensure_user(db_session, USER_B_ID)
    db_session.add(
        UserStoreAlias(
            user_id=USER_B_ID,
            store_id=uuid.UUID(rcss),
            target_store_id=uuid.UUID(loblaws),
        )
    )
    await db_session.flush()

    assert len((await _compare(client, item_id))["stores"]) == 2
    assert all(s["merged_stores"] == [] for s in await _stores(client))


# --- price alerts and store mutes -------------------------------------------


async def _alerts(db_session) -> list[Notification]:
    return list(
        (
            await db_session.execute(
                select(Notification).where(Notification.type == "price_change")
            )
        )
        .scalars()
        .all()
    )


async def test_a_muted_store_merged_into_another_mutes_the_merged_store(
    client, db_session
):
    """A mute covers the user's whole group: a muted store merged into another
    keeps its prices quiet, and the other store's prices too."""
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.0)
    await _manual(client, "Loblaws", "2026-03-02", "Limes", 1.0)
    await _manual(client, "FreshCo", "2026-03-03", "Kiwis", 1.0)
    loblaws = await _store_id(client, "Loblaws")
    freshco = await _store_id(client, "FreshCo")
    assert (await client.post(f"/api/stores/{freshco}/mute")).status_code == 204

    await _merge(client, freshco, loblaws)

    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_stores"] == [{"id": loblaws, "name": "Loblaws"}]
    await _manual(client, "Loblaws", "2026-03-04", "Limes", 2.0)
    assert await _alerts(db_session) == []

    # Unmuting the group unmutes every store in it.
    assert (await client.delete(f"/api/stores/{loblaws}/mute")).status_code == 204
    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_stores"] == []
    await _manual(client, "LOBLAWS #7", "2026-03-05", "Limes", 2.0)
    assert len(await _alerts(db_session)) == 1


async def test_after_unmerge_a_mute_stays_with_the_store_it_was_set_on(client):
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.0)
    await _manual(client, "FreshCo", "2026-03-03", "Limes", 1.0)
    loblaws = await _store_id(client, "Loblaws")
    freshco = await _store_id(client, "FreshCo")
    assert (await client.post(f"/api/stores/{freshco}/mute")).status_code == 204
    await _merge(client, freshco, loblaws)

    assert (await client.delete(f"/api/stores/{freshco}/merge")).status_code == 204

    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_stores"] == [{"id": freshco, "name": "FreshCo"}]


async def test_muting_a_merged_group_quiets_the_merged_store(client, db_session):
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.0)
    await _manual(client, "FreshCo", "2026-03-02", "Limes", 1.0)
    await _manual(client, "FreshCo", "2026-03-03", "Limes", 1.0)
    loblaws = await _store_id(client, "Loblaws")
    freshco = await _store_id(client, "FreshCo")
    await _merge(client, freshco, loblaws)

    # Muting by the merged store's own id mutes the group.
    assert (await client.post(f"/api/stores/{freshco}/mute")).status_code == 204

    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_stores"] == [{"id": loblaws, "name": "Loblaws"}]
    await _manual(client, "FreshCo", "2026-03-04", "Limes", 2.0)
    assert await _alerts(db_session) == []


async def test_a_price_alert_names_the_merged_store(client, db_session):
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.0)
    await _manual(client, "Loblaws", "2026-03-02", "Limes", 1.0)
    await _manual(client, "FreshCo", "2026-03-03", "Kiwis", 1.0)
    await _merge(
        client,
        await _store_id(client, "FreshCo"),
        await _store_id(client, "Loblaws"),
    )

    await _manual(client, "FreshCo", "2026-03-04", "Limes", 1.5)

    [alert] = await _alerts(db_session)
    assert " at Loblaws:" in alert.body


# --- names never cross accounts ----------------------------------------------


async def _another_user_shops_at(db_session, name: str) -> Store:
    """User B's receipt saved first, so the shared row carries B's name."""
    from datetime import date

    from app.models.database import Receipt
    from app.services.store_service import StoreService

    await ensure_user(db_session, USER_B_ID)
    store = await StoreService(db_session).find_or_create(name)
    db_session.add(
        Receipt(
            user_id=USER_B_ID,
            store_id=store.id,
            store_name=name,
            date=date(2026, 3, 1),
            status="confirmed",
            currency="USD",
        )
    )
    await db_session.flush()
    return store


async def test_a_receipt_shows_its_own_store_name_not_another_users(client, db_session):
    """Two users share one store row; each receipt keeps the name printed on
    it, and the user's store views use their own name."""
    store = await _another_user_shops_at(db_session, "LOBLAWS #1234")
    receipt = await _manual(client, "Loblaws", "2026-03-02", "Limes", 1.0)
    await _manual(client, "Loblaws", "2026-03-03", "Limes", 1.0)

    assert receipt["store_name"] == "Loblaws"
    detail = (await client.get(f"/api/receipts/{receipt['id']}")).json()
    assert detail["store_name"] == "Loblaws"
    history = (await client.get("/api/receipts")).json()
    assert {r["store_name"] for r in history["items"]} == {"Loblaws"}
    [mine] = await _stores(client)
    assert (mine["id"], mine["name"]) == (str(store.id), "Loblaws")
    item_id = await _item_id(client, "limes")
    [compared] = (await _compare(client, item_id))["stores"]
    assert compared["store_name"] == "Loblaws"
    text = str((await client.get(f"/api/items/{item_id}/prices")).json())
    assert "#1234" not in text
    # The shared row is untouched.
    await db_session.refresh(store)
    assert store.name == "LOBLAWS #1234"


async def test_correcting_the_store_name_keeps_the_correction(client, db_session):
    """A correction to a name of the same store (same normalized row) is kept
    on the receipt, not dropped for the row's name."""
    await _another_user_shops_at(db_session, "Loblaws")
    receipt = await _manual(client, "Loblaws", "2026-03-02", "Limes", 1.0)

    resp = await client.patch(
        f"/api/receipts/{receipt['id']}", json={"store_name": "LOBLAWS #99"}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["store_name"] == "LOBLAWS #99"
    detail = (await client.get(f"/api/receipts/{receipt['id']}")).json()
    assert detail["store_name"] == "LOBLAWS #99"
    # The history filter searches the names on the user's own receipts.
    found = (await client.get("/api/receipts", params={"store": "#99"})).json()
    assert [r["id"] for r in found["items"]] == [receipt["id"]]


async def test_the_history_filter_never_matches_another_users_name(client, db_session):
    await _another_user_shops_at(db_session, "Unit 7 Cafe #3")
    await _manual(client, "Unit 7 Cafe", "2026-03-02", "Limes", 1.0)

    found = (await client.get("/api/receipts", params={"store": "#3"})).json()

    assert found["items"] == []


async def _purge_receipts_at(db_session, store_name: str) -> None:
    """What the purge leaves once these receipts are past restore."""
    from sqlalchemy import delete

    from app.models.database import LineItem, PriceObservation, Receipt
    from tests.conftest import DEV_USER_ID

    receipts = select(Receipt.id).where(
        Receipt.user_id == DEV_USER_ID, Receipt.store_name == store_name
    )
    await db_session.execute(
        delete(PriceObservation).where(PriceObservation.receipt_id.in_(receipts))
    )
    await db_session.execute(delete(LineItem).where(LineItem.receipt_id.in_(receipts)))
    await db_session.execute(
        delete(Receipt).where(
            Receipt.user_id == DEV_USER_ID, Receipt.store_name == store_name
        )
    )
    await db_session.flush()


async def test_a_merge_target_purged_keeps_the_users_name(client, db_session):
    """X merged into Y, then Y's receipts purged: X's prices still show the
    user's name for Y, never the shared row's (another user's)."""
    await _another_user_shops_at(db_session, "LOBLAWS #5555")
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.0)
    await _manual(client, "Superstore", "2026-03-02", "Limes", 1.0)
    await _manual(client, "Superstore", "2026-03-03", "Limes", 1.0)
    await _merge(
        client,
        await _store_id(client, "Superstore"),
        await _store_id(client, "Loblaws"),
    )

    await _purge_receipts_at(db_session, "Loblaws")

    item_id = await _item_id(client, "limes")
    [compared] = (await _compare(client, item_id))["stores"]
    assert compared["store_name"] == "Loblaws"
    assert [s["name"] for s in await _stores(client)] == ["Loblaws"]
    history = (await client.get(f"/api/items/{item_id}/prices")).json()
    assert {o["store_name"] for o in history["observations"]} == {"Loblaws"}
    # A price alert from the merged store names the user's store too.
    await _manual(client, "Superstore", "2026-03-04", "Limes", 2.0)
    [alert] = await _alerts(db_session)
    assert " at Loblaws:" in alert.body


async def test_a_mute_outliving_its_receipts_keeps_the_users_name(client, db_session):
    await _another_user_shops_at(db_session, "LOBLAWS #5555")
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.0)
    loblaws = await _store_id(client, "Loblaws")
    assert (await client.post(f"/api/stores/{loblaws}/mute")).status_code == 204

    await _purge_receipts_at(db_session, "Loblaws")

    settings = (await client.get("/api/items/price-alert-settings")).json()
    assert settings["muted_stores"] == [{"id": loblaws, "name": "Loblaws"}]
