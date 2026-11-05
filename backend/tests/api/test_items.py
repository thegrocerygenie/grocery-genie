"""PI-01 price history and PI-02 item matching through the API.

Receipts are confirmed the way the app does it (scan, then PATCH status), and
manual entries, which are saved confirmed.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult
from app.models.database import PriceObservation
from tests.api.test_analytics import SpyBackend


def _extraction(store: str, day: str, *items: tuple) -> ReceiptExtractionResult:
    """items: (name, quantity, unit_price[, unit_of_measure])."""
    lines = []
    for item in items:
        name, quantity, unit_price, *unit = item
        lines.append(
            ExtractedLineItem(
                name=name,
                quantity=quantity,
                unit_price=unit_price,
                total_price=round(quantity * unit_price, 2),
                unit_of_measure=unit[0] if unit else None,
                category="Groceries",
                confidence=0.95,
            )
        )
    total = round(sum(li.total_price for li in lines), 2)
    return ReceiptExtractionResult(
        store_name=store,
        date=day,
        currency="USD",
        items=lines,
        subtotal=total,
        tax=0,
        total=total,
        confidence=0.95,
        store_name_confidence=0.95,
        date_confidence=0.95,
        total_confidence=0.95,
    )


async def _scan(client, mock_extractor, image, store, day, *items) -> dict:
    mock_extractor._result = _extraction(store, day, *items)
    scan = await client.post(
        "/api/receipts/scan", files={"file": ("r.jpg", image, "image/jpeg")}
    )
    assert scan.status_code == 200, scan.text
    return scan.json()


async def _scan_and_confirm(client, mock_extractor, image, store, day, *items):
    scan = await _scan(client, mock_extractor, image, store, day, *items)
    resp = await client.patch(
        f"/api/receipts/{scan['receipt_id']}", json={"status": "confirmed"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _item_id(client: AsyncClient, name: str) -> str:
    resp = await client.get("/api/items", params={"q": name})
    assert resp.status_code == 200, resp.text
    [item] = resp.json()["items"]
    return item["id"]


@pytest.fixture
def analytics_spy(client):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    return spy


# --- PI-01: price history ---------------------------------------------------


async def test_every_price_is_recorded_with_date_and_store(
    client, mock_extractor, test_image_bytes
):
    """PI-01 AC 1: every recorded price with its date and store."""
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("ORG BANANAS", 2.0, 0.69, "lb"),
    )
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "Loblaws",
        "2026-03-12",
        ("Org Bananas", 3.0, 0.79, "lb"),
    )
    item_id = await _item_id(client, "bananas")

    resp = await client.get(f"/api/items/{item_id}/prices")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["has_timeline"] is True
    assert body["min_points"] == 2
    assert body["store_count"] == 2
    points = body["observations"]
    assert [(p["date"], p["store_name"], p["unit_price"]) for p in points] == [
        ("2026-03-01", "FreshCo", 0.69),
        ("2026-03-12", "Loblaws", 0.79),
    ]
    assert all(p["in_timeline"] for p in points)


async def test_prices_are_unit_prices(client, mock_extractor, test_image_bytes):
    """PI-01 AC 3: unit price (per lb here), not the line total."""
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Ground Beef", 2.5, 5.99, "lb"),
    )
    item_id = await _item_id(client, "beef")

    body = (await client.get(f"/api/items/{item_id}/prices")).json()

    assert body["unit_of_measure"] == "lb"
    assert body["currency"] == "USD"
    [point] = body["observations"]
    assert point["unit_price"] == 5.99
    assert point["quantity"] == 2.5
    assert point["unit_of_measure"] == "lb"


async def test_one_price_is_not_yet_a_timeline(
    client, mock_extractor, test_image_bytes
):
    """PI-01 AC 4: at least 2 data points before the timeline shows."""
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
    )
    item_id = await _item_id(client, "limes")

    body = (await client.get(f"/api/items/{item_id}/prices")).json()

    assert body["has_timeline"] is False
    assert len(body["observations"]) == 1


async def test_prices_in_another_unit_are_listed_but_not_plotted(
    client, mock_extractor, test_image_bytes
):
    """Edge case "unit price ambiguity": only like-for-like prices compare."""
    for day, unit, price in [
        ("2026-03-01", "lb", 0.69),
        ("2026-03-05", "lb", 0.72),
        ("2026-03-09", "each", 0.25),
    ]:
        await _scan_and_confirm(
            client,
            mock_extractor,
            test_image_bytes,
            "FreshCo",
            day,
            ("Bananas", 1, price, unit),
        )
    item_id = await _item_id(client, "bananas")

    body = (await client.get(f"/api/items/{item_id}/prices")).json()

    assert body["unit_of_measure"] == "lb"
    assert [p["in_timeline"] for p in body["observations"]] == [True, True, False]
    assert body["has_timeline"] is True


async def test_unconfirmed_receipts_record_no_prices(
    client, mock_extractor, test_image_bytes, db_session
):
    await _scan(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
    )

    items = (await client.get("/api/items")).json()
    assert items["items"] == []
    count = await db_session.scalar(select(func.count(PriceObservation.id)))
    assert count == 0


async def test_manual_receipts_record_prices(client):
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Store",
            "date": "2026-03-04",
            "total": 3.0,
            "items": [
                {"name": "Eggs", "quantity": 1, "unit_price": 3.0, "total_price": 3.0}
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    [line] = resp.json()["items"]
    assert line["canonical_item_id"] is not None

    item = (await client.get(f"/api/items/{line['canonical_item_id']}")).json()
    assert item["canonical_name"] == "Eggs"
    assert item["latest_price"]["unit_price"] == 3.0
    assert item["latest_price"]["store_name"] == "Corner Store"


async def test_store_and_date_filters(client, mock_extractor, test_image_bytes):
    """GET /api/items/{id}/prices?store=...&from=...&to=... (API contract)."""
    for store, day in [
        ("FreshCo", "2026-02-01"),
        ("Loblaws", "2026-03-01"),
        ("FreshCo", "2026-03-10"),
    ]:
        receipt = await _scan_and_confirm(
            client,
            mock_extractor,
            test_image_bytes,
            store,
            day,
            ("Limes", 1, 0.5),
        )
    item_id = await _item_id(client, "limes")
    all_points = (await client.get(f"/api/items/{item_id}/prices")).json()
    freshco = next(
        p["store_id"]
        for p in all_points["observations"]
        if p["store_name"] == "FreshCo"
    )

    by_store = (
        await client.get(f"/api/items/{item_id}/prices", params={"store": freshco})
    ).json()
    in_march = (
        await client.get(
            f"/api/items/{item_id}/prices",
            params={"from": "2026-03-01", "to": "2026-03-31"},
        )
    ).json()

    assert [p["date"] for p in by_store["observations"]] == [
        "2026-02-01",
        "2026-03-10",
    ]
    assert [p["date"] for p in in_march["observations"]] == [
        "2026-03-01",
        "2026-03-10",
    ]
    assert receipt["status"] == "confirmed"


async def test_deleted_receipts_leave_the_history_and_return_on_restore(
    client, mock_extractor, test_image_bytes
):
    first = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
    )
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-08",
        ("Limes", 1, 0.6),
    )
    item_id = await _item_id(client, "limes")

    await client.delete(f"/api/receipts/{first['id']}")
    after_delete = (await client.get(f"/api/items/{item_id}/prices")).json()
    await client.post(f"/api/receipts/{first['id']}/restore")
    after_restore = (await client.get(f"/api/items/{item_id}/prices")).json()

    assert [p["unit_price"] for p in after_delete["observations"]] == [0.6]
    assert after_delete["has_timeline"] is False
    assert [p["unit_price"] for p in after_restore["observations"]] == [0.5, 0.6]


async def test_editing_a_confirmed_receipt_updates_its_prices(
    client, mock_extractor, test_image_bytes
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

    resp = await client.patch(
        f"/api/receipts/{receipt['id']}",
        json={
            "store_name": "Loblaws",
            "date": "2026-03-02",
            "items": [{"id": line["id"], "total_price": 1.5}],
        },
    )
    assert resp.status_code == 200, resp.text

    [point] = (
        await client.get(f"/api/items/{line['canonical_item_id']}/prices")
    ).json()["observations"]
    assert point["unit_price"] == 0.75
    assert point["date"] == "2026-03-02"
    assert point["store_name"] == "Loblaws"


async def test_renaming_a_confirmed_line_matches_it_again(
    client, mock_extractor, test_image_bytes
):
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Avocado", 1, 1.5),
    )
    receipt = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-02",
        ("ORG BNNA", 1, 1.2),
    )
    [line] = receipt["items"]
    avocado_id = await _item_id(client, "avocado")
    assert line["canonical_item_id"] != avocado_id

    resp = await client.patch(
        f"/api/receipts/{receipt['id']}",
        json={"items": [{"id": line["id"], "name": "AVOCADO"}]},
    )

    assert resp.json()["items"][0]["canonical_item_id"] == avocado_id
    prices = (await client.get(f"/api/items/{avocado_id}/prices")).json()
    assert [p["unit_price"] for p in prices["observations"]] == [1.5, 1.2]


async def test_matching_failure_never_fails_the_confirm(
    client, mock_extractor, test_image_bytes, monkeypatch
):
    from app.services.item_matching_service import ItemMatchingService

    async def broken(*args, **kwargs):
        raise RuntimeError("matching blew up")

    monkeypatch.setattr(ItemMatchingService, "match_line_items", broken)

    receipt = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
    )

    assert receipt["status"] == "confirmed"
    assert receipt["items"][0]["canonical_item_id"] is None


async def test_viewing_price_history_emits_the_analytics_event(
    client, mock_extractor, test_image_bytes, analytics_spy
):
    """12-analytics.md: price_history_viewed {canonical_item_id, store_count}."""
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
    )
    item_id = await _item_id(client, "limes")

    await client.get(f"/api/items/{item_id}/prices")

    viewed = [c for c in analytics_spy.calls if c[0] == "price_history_viewed"]
    assert viewed[0][1] == {"canonical_item_id": item_id, "store_count": 1}


# --- Item list and detail ------------------------------------------------------


async def test_item_list_is_most_recent_first_and_searchable(
    client, mock_extractor, test_image_bytes
):
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
        ("Avocado", 1, 1.5),
    )
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-09",
        ("Avocado", 1, 1.25),
    )

    body = (await client.get("/api/items")).json()

    assert [i["canonical_name"] for i in body["items"]] == ["Avocado", "Limes"]
    avocado = body["items"][0]
    assert avocado["observation_count"] == 2
    assert avocado["latest_price"]["unit_price"] == 1.25
    assert avocado["latest_price"]["date"] == "2026-03-09"
    assert body["total"] == 2
    searched = (await client.get("/api/items", params={"q": "LIM"})).json()
    assert [i["canonical_name"] for i in searched["items"]] == ["Limes"]


async def test_items_are_private_to_their_user(client_user_b, db_session):
    """User B gets 404 for every route on user A's item and suggestion, and
    A's item and suggestion are unchanged. A's rows are stored directly; B
    uses the API."""
    from app.services.item_matching_service import ItemMatchingService
    from tests.conftest import DEV_USER_ID
    from tests.services.test_item_matching import _receipt

    _, lines = await _receipt(db_session, "Limes", "Lime", user_id=DEV_USER_ID)
    service = ItemMatchingService(db_session)
    await service.match_line_items(DEV_USER_ID, lines)
    item = await service.get_item(DEV_USER_ID, lines[0].canonical_item_id)
    await db_session.refresh(item, ["aliases"])
    item_id, alias_id = item.id, item.aliases[0].id
    _, first = await _receipt(db_session, "Cucumber", user_id=DEV_USER_ID)
    await service.match_line_items(DEV_USER_ID, first)
    _, second = await _receipt(db_session, "CUCUMBERS ENG", user_id=DEV_USER_ID)
    await service.match_line_items(DEV_USER_ID, second)
    [suggestion] = await service.list_suggestions(DEV_USER_ID)
    await db_session.commit()
    b_item = (
        await client_user_b.post(
            "/api/receipts",
            json={
                "store_name": "Corner Store",
                "date": "2026-03-04",
                "total": 3.0,
                "items": [
                    {
                        "name": "Eggs",
                        "quantity": 1,
                        "unit_price": 3.0,
                        "total_price": 3.0,
                    }
                ],
            },
        )
    ).json()["items"][0]["canonical_item_id"]

    assert [
        i["id"] for i in (await client_user_b.get("/api/items")).json()["items"]
    ] == [b_item]
    for method, url, body in [
        ("GET", f"/api/items/{item_id}", None),
        ("GET", f"/api/items/{item_id}/prices", None),
        ("PATCH", f"/api/items/{item_id}", {"canonical_name": "Mine"}),
        ("POST", f"/api/items/{item_id}/merge", {"into_item_id": b_item}),
        ("POST", f"/api/items/{b_item}/merge", {"into_item_id": str(item_id)}),
        ("POST", f"/api/items/{item_id}/aliases/{alias_id}/split", None),
        ("POST", f"/api/items/suggestions/{suggestion.id}/accept", None),
        ("POST", f"/api/items/suggestions/{suggestion.id}/reject", None),
    ]:
        resp = await client_user_b.request(method, url, json=body)
        assert resp.status_code == 404, (method, url, resp.text)

    db_session.expire_all()
    item = await service.get_item(DEV_USER_ID, item_id)
    assert item.canonical_name == "Limes"
    # A's suggestion is still pending: B's answers changed nothing.
    assert [s.id for s in await service.list_suggestions(DEV_USER_ID)] == [
        suggestion.id
    ]


async def test_unknown_item_is_404(client):
    resp = await client.get(f"/api/items/{uuid.uuid4()}")
    assert resp.status_code == 404


# --- PI-02: link, unlink, rename, confirm suggestions ----------------------------


async def test_rename_item(client, mock_extractor, test_image_bytes):
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("ORG BNNA", 1, 0.5),
    )
    item_id = await _item_id(client, "bnna")

    resp = await client.patch(
        f"/api/items/{item_id}", json={"canonical_name": " Organic Bananas "}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["canonical_name"] == "Organic Bananas"
    blank = await client.patch(f"/api/items/{item_id}", json={"canonical_name": " "})
    assert blank.status_code == 422


async def test_merge_and_split_through_the_api(
    client, mock_extractor, test_image_bytes
):
    """PI-02 AC 3: the user links two items, then unlinks one name again."""
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Seltzer", 1, 1.0),
        ("Club Soda", 1, 1.1),
    )
    seltzer = await _item_id(client, "seltzer")
    club_soda = await _item_id(client, "club")

    merged = await client.post(
        f"/api/items/{club_soda}/merge", json={"into_item_id": seltzer}
    )
    assert merged.status_code == 200, merged.text
    body = merged.json()
    assert body["id"] == seltzer
    assert {a["alias"] for a in body["aliases"]} == {"Seltzer", "Club Soda"}
    assert body["observation_count"] == 2
    assert (await client.get(f"/api/items/{club_soda}")).status_code == 404

    alias_id = next(a["id"] for a in body["aliases"] if a["alias"] == "Club Soda")
    split = await client.post(f"/api/items/{seltzer}/aliases/{alias_id}/split")
    assert split.status_code == 201, split.text
    new_item = split.json()
    assert new_item["canonical_name"] == "Club Soda"
    assert new_item["observation_count"] == 1
    assert (await client.get(f"/api/items/{seltzer}")).json()["observation_count"] == 1

    only = (await client.get(f"/api/items/{seltzer}")).json()["aliases"][0]["id"]
    refused = await client.post(f"/api/items/{seltzer}/aliases/{only}/split")
    assert refused.status_code == 409
    self_merge = await client.post(
        f"/api/items/{seltzer}/merge", json={"into_item_id": seltzer}
    )
    assert self_merge.status_code == 409


async def _suggestion(client, mock_extractor, test_image_bytes):
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Cucumber", 1, 0.99),
    )
    await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-08",
        ("CUCUMBERS ENG", 1, 1.29),
    )
    [suggestion] = (await client.get("/api/items/suggestions")).json()
    return suggestion


async def test_medium_confidence_match_is_offered_for_confirmation(
    client, mock_extractor, test_image_bytes
):
    """PI-02 AC 2: 0.6-0.85 prompts the user."""
    suggestion = await _suggestion(client, mock_extractor, test_image_bytes)

    assert suggestion["item"]["canonical_name"] == "CUCUMBERS ENG"
    assert suggestion["suggested_item"]["canonical_name"] == "Cucumber"
    assert 0.6 <= suggestion["confidence"] < 0.85
    listing = (await client.get("/api/items")).json()
    assert listing["pending_suggestions"] == 1
    detail = (await client.get(f"/api/items/{suggestion['item']['id']}")).json()
    assert [s["id"] for s in detail["suggestions"]] == [suggestion["id"]]


async def test_accepting_a_suggestion_merges_the_history(
    client, mock_extractor, test_image_bytes, analytics_spy
):
    suggestion = await _suggestion(client, mock_extractor, test_image_bytes)

    resp = await client.post(f"/api/items/suggestions/{suggestion['id']}/accept")

    assert resp.status_code == 200, resp.text
    merged = resp.json()
    assert merged["id"] == suggestion["suggested_item"]["id"]
    assert merged["observation_count"] == 2
    prices = (await client.get(f"/api/items/{merged['id']}/prices")).json()
    assert prices["has_timeline"] is True
    assert (await client.get("/api/items/suggestions")).json() == []
    resolved = [c[1] for c in analytics_spy.calls if c[0] == "item_match_resolved"]
    assert resolved == [
        {
            "decision": "accepted",
            "method": "fuzzy",
            "confidence": suggestion["confidence"],
        }
    ]
    again = await client.post(f"/api/items/suggestions/{suggestion['id']}/accept")
    assert again.status_code == 404


async def test_rejecting_a_suggestion_keeps_the_items_apart(
    client, mock_extractor, test_image_bytes
):
    suggestion = await _suggestion(client, mock_extractor, test_image_bytes)

    resp = await client.post(f"/api/items/suggestions/{suggestion['id']}/reject")

    assert resp.status_code == 204, resp.text
    assert (await client.get("/api/items/suggestions")).json() == []
    assert (await client.get("/api/items")).json()["total"] == 2
    again = await client.post(f"/api/items/suggestions/{suggestion['id']}/reject")
    assert again.status_code == 409


async def test_receipt_lines_carry_their_item(client, mock_extractor, test_image_bytes):
    receipt = await _scan_and_confirm(
        client,
        mock_extractor,
        test_image_bytes,
        "FreshCo",
        "2026-03-01",
        ("Limes", 1, 0.5),
    )
    fetched = (await client.get(f"/api/receipts/{receipt['id']}")).json()
    assert fetched["items"][0]["canonical_item_id"] == await _item_id(client, "limes")
