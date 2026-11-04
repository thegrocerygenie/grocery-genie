"""PI-04 cross-store price comparison: GET /api/items/{id}/compare.

Prices are recorded the way the app does it: manual entries (saved confirmed)
and scans confirmed with PATCH status.
"""

import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.models.database import PriceObservation, Store
from tests.api.test_items import _item_id, _scan_and_confirm, analytics_spy  # noqa: F401
from tests.conftest import USER_B_ID
from tests.services.test_item_matching import _receipt


async def _manual(
    client: AsyncClient,
    store: str,
    day: str,
    name: str,
    unit_price: float,
    *,
    currency: str | None = None,
    quantity: float = 1.0,
) -> dict:
    total = round(quantity * unit_price, 2)
    body = {
        "store_name": store,
        "date": day,
        "total": total,
        "items": [
            {
                "name": name,
                "quantity": quantity,
                "unit_price": unit_price,
                "total_price": total,
            }
        ],
    }
    if currency is not None:
        body["currency"] = currency
    resp = await client.post("/api/receipts", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _compare(client: AsyncClient, item_id: str) -> dict:
    resp = await client.get(f"/api/items/{item_id}/compare")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _by_store(body: dict) -> dict[str, dict]:
    return {s["store_name"]: s for s in body["stores"]}


async def test_side_by_side_latest_and_average_per_store(client):
    """PI-04 AC 1 + AC 2: every store with prices, its latest and average."""
    for store, day, price in [
        ("FreshCo", "2026-03-01", 0.60),
        ("FreshCo", "2026-03-15", 0.80),
        ("Loblaws", "2026-03-03", 0.90),
        ("Loblaws", "2026-03-10", 1.00),
        ("Loblaws", "2026-03-20", 1.10),
    ]:
        await _manual(client, store, day, "Limes", price)
    item_id = await _item_id(client, "limes")

    body = await _compare(client, item_id)

    assert body["item"] == {"id": item_id, "canonical_name": "Limes"}
    assert body["currency"] == "USD"
    assert body["min_observations"] == 2
    stores = _by_store(body)
    assert set(stores) == {"FreshCo", "Loblaws"}
    assert stores["FreshCo"]["latest_price"] == 0.80
    assert stores["FreshCo"]["latest_date"] == "2026-03-15"
    assert stores["FreshCo"]["avg_price"] == 0.70
    assert stores["FreshCo"]["observation_count"] == 2
    assert stores["Loblaws"]["latest_price"] == 1.10
    assert stores["Loblaws"]["latest_date"] == "2026-03-20"
    assert stores["Loblaws"]["avg_price"] == 1.00
    assert stores["Loblaws"]["observation_count"] == 3
    assert all(s["store_id"] for s in body["stores"])


async def test_stores_are_cheapest_first_by_average(client):
    """PI-04 story: "so that I know which store is cheapest"."""
    for store, price in [("Loblaws", 2.0), ("FreshCo", 1.5), ("Metro", 1.75)]:
        await _manual(client, store, "2026-03-01", "Avocado", price)
        await _manual(client, store, "2026-03-08", "Avocado", price)
    item_id = await _item_id(client, "avocado")

    body = await _compare(client, item_id)

    assert [s["store_name"] for s in body["stores"]] == [
        "FreshCo",
        "Metro",
        "Loblaws",
    ]


async def test_a_store_needs_two_prices_to_be_compared(client):
    """FR "minimum 2 observations per store per item to be included"."""
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.5)
    await _manual(client, "FreshCo", "2026-03-08", "Limes", 0.6)
    await _manual(client, "Loblaws", "2026-03-09", "Limes", 0.4)
    item_id = await _item_id(client, "limes")

    body = await _compare(client, item_id)

    assert [s["store_name"] for s in body["stores"]] == ["FreshCo"]
    assert body["stores_below_minimum"] == 1


async def test_average_is_rounded_half_up_to_the_cent(client):
    """08-api-contracts.md: avg_price is "rounded to the cent", half up, so an
    average of 0.705 is 0.71 (banker's rounding would give 0.70)."""
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.70)
    await _manual(client, "FreshCo", "2026-03-08", "Limes", 0.71)
    item_id = await _item_id(client, "limes")

    body = await _compare(client, item_id)

    assert _by_store(body)["FreshCo"]["avg_price"] == 0.71


async def test_one_price_anywhere_compares_nothing(client):
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.5)
    item_id = await _item_id(client, "limes")

    body = await _compare(client, item_id)

    assert body["stores"] == []
    assert body["stores_below_minimum"] == 1


async def test_only_stores_the_user_bought_from_are_shown(
    client, mock_extractor, test_image_bytes, db_session
):
    """PI-04 AC 3: a store the user never scanned from is not listed, nor is
    a receipt with no store, nor a deleted receipt. Another user's cheaper
    Costco prices for this very item stay out too."""
    costco = Store(name="Costco", normalized_name="costco")
    db_session.add(costco)
    await db_session.flush()
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.5)
    await _manual(client, "FreshCo", "2026-03-08", "Limes", 0.6)
    for day in ["2026-03-02", "2026-03-09"]:
        await _scan_and_confirm(
            client,
            mock_extractor,
            test_image_bytes,
            None,
            day,
            ("Limes", 1, 0.3),
        )
    deleted = [
        await _manual(client, "Metro", day, "Limes", 0.2)
        for day in ["2026-03-03", "2026-03-10"]
    ]
    for receipt in deleted:
        resp = await client.delete(f"/api/receipts/{receipt['id']}")
        assert resp.status_code in (200, 204), resp.text
    item_id = await _item_id(client, "limes")
    # Two prices from another user at Costco, filed against this item: enough
    # to be compared, and cheapest, if the comparison stopped scoping by user.
    for day in [date(2026, 3, 4), date(2026, 3, 11)]:
        receipt, [line] = await _receipt(db_session, "Limes", user_id=USER_B_ID)
        receipt.store_id = costco.id
        receipt.date = day
        line.unit_price = line.total_price = 0.1
        db_session.add(
            PriceObservation(
                user_id=USER_B_ID,
                canonical_item_id=uuid.UUID(item_id),
                receipt_id=receipt.id,
                line_item_id=line.id,
                store_id=costco.id,
                date=day,
                unit_price=0.1,
                quantity=1,
                currency="USD",
            )
        )
    await db_session.flush()

    body = await _compare(client, item_id)

    assert [s["store_name"] for s in body["stores"]] == ["FreshCo"]
    assert body["stores_below_minimum"] == 0


async def test_only_like_for_like_prices_are_compared(
    client, mock_extractor, test_image_bytes
):
    """Edge case "unit price ambiguity": a price in another unit or currency
    counts toward neither the latest nor the average."""
    for store, day, price, unit in [
        ("FreshCo", "2026-03-01", 0.69, "lb"),
        ("FreshCo", "2026-03-05", 0.71, "lb"),
        ("FreshCo", "2026-03-20", 0.25, "each"),
        ("Loblaws", "2026-03-02", 0.79, "lb"),
        ("Loblaws", "2026-03-06", 0.81, "lb"),
    ]:
        await _scan_and_confirm(
            client,
            mock_extractor,
            test_image_bytes,
            store,
            day,
            ("Bananas", 1, price, unit),
        )
    item_id = await _item_id(client, "bananas")

    body = await _compare(client, item_id)

    assert body["unit_of_measure"] == "lb"
    freshco = _by_store(body)["FreshCo"]
    assert freshco["latest_price"] == 0.71
    assert freshco["latest_date"] == "2026-03-05"
    assert freshco["avg_price"] == 0.70
    assert freshco["observation_count"] == 2


async def test_prices_in_another_currency_are_not_compared(client):
    await _manual(client, "FreshCo", "2026-03-01", "Limes", 0.5)
    await _manual(client, "FreshCo", "2026-03-08", "Limes", 0.7)
    await _manual(client, "Loblaws", "2026-03-02", "Limes", 0.4)
    await _manual(client, "Loblaws", "2026-03-09", "Limes", 0.6)
    await _manual(client, "Duty Free", "2026-03-04", "Limes", 0.9, currency="EUR")
    await _manual(client, "Duty Free", "2026-03-05", "Limes", 0.9, currency="EUR")
    item_id = await _item_id(client, "limes")

    body = await _compare(client, item_id)

    assert body["currency"] == "USD"
    assert [s["store_name"] for s in body["stores"]] == ["Loblaws", "FreshCo"]


async def test_comparison_is_private_and_unknown_items_are_404(
    client_user_b, db_session
):
    from app.services.item_matching_service import ItemMatchingService
    from tests.conftest import DEV_USER_ID
    from tests.services.test_item_matching import _receipt

    _, lines = await _receipt(db_session, "Limes", user_id=DEV_USER_ID)
    await ItemMatchingService(db_session).match_line_items(DEV_USER_ID, lines)
    a_item = lines[0].canonical_item_id

    for item_id in [a_item, uuid.uuid4()]:
        resp = await client_user_b.get(f"/api/items/{item_id}/compare")
        assert resp.status_code == 404, resp.text


async def test_viewing_the_comparison_emits_the_analytics_event(
    client,
    analytics_spy,  # noqa: F811
):
    """12-analytics.md: price_comparison_viewed {canonical_item_id, store_count}."""
    for store in ["FreshCo", "Loblaws"]:
        await _manual(client, store, "2026-03-01", "Limes", 0.5)
        await _manual(client, store, "2026-03-08", "Limes", 0.6)
    item_id = await _item_id(client, "limes")

    await _compare(client, item_id)

    viewed = [c for c in analytics_spy.calls if c[0] == "price_comparison_viewed"]
    assert viewed[0][1] == {"canonical_item_id": item_id, "store_count": 2}


async def test_a_sale_price_is_a_regular_observation(client):
    """11-edge-cases.md Price Intelligence 3: a promotional price gets no
    special handling. It is recorded and plotted like any other, and the
    store's average takes it in."""
    await _manual(client, "Loblaws", "2026-03-01", "Limes", 1.00)
    await _manual(client, "Loblaws", "2026-03-08", "Limes", 1.00)
    await _manual(client, "Loblaws", "2026-03-15", "Limes", 0.40)  # on sale
    item_id = await _item_id(client, "limes")

    history = (await client.get(f"/api/items/{item_id}/prices")).json()
    prices = sorted(
        (o["unit_price"], o["in_timeline"]) for o in history["observations"]
    )
    assert prices == [(0.40, True), (1.00, True), (1.00, True)]

    loblaws = _by_store(await _compare(client, item_id))["Loblaws"]
    assert loblaws["latest_price"] == 0.40
    assert loblaws["avg_price"] == pytest.approx(0.80)
    assert loblaws["observation_count"] == 3
