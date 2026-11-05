"""PI-02 AC 10-15 (DA-6): split an item by line, and the Link items sheet.

Receipts are manual entries (saved confirmed), so each line is linked to its
item and has its price at once. One name on several receipts links to one
item by its alias, which is what a split by line takes apart.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.security import get_current_user
from app.models.database import PriceObservation, User
from tests.api.test_items import _scan_and_confirm
from tests.conftest import DEV_USER_ID, USER_B_ID


async def _act_as(db_session, user_id: uuid.UUID) -> None:
    """The client fixtures share one app: point its signed-in user at
    ``user_id`` (stored by the client and client_user_b fixtures)."""
    from main import app

    user = await db_session.get(User, user_id)

    async def current() -> User:
        return user

    app.dependency_overrides[get_current_user] = current


async def _manual(
    client: AsyncClient,
    day: str,
    *lines: tuple,
    store: str = "FreshCo",
) -> dict:
    """lines: (name, unit_price[, unit_of_measure])."""
    items = []
    for name, price, *unit in lines:
        items.append(
            {
                "name": name,
                "quantity": 1,
                "unit_price": price,
                "total_price": price,
                **({"unit_of_measure": unit[0]} if unit else {}),
            }
        )
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": store,
            "date": day,
            "total": round(sum(i["total_price"] for i in items), 2),
            "items": items,
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


async def _olive_oil(client: AsyncClient) -> tuple[str, list[str]]:
    """One name, three prices: the item and its line ids, oldest first."""
    lines = []
    for day, price, store in [
        ("2026-03-01", 11.49, "FreshCo"),
        ("2026-03-08", 11.99, "Loblaws"),
        ("2026-03-15", 24.99, "FreshCo"),
    ]:
        receipt = await _manual(client, day, ("OLIVE OIL", price), store=store)
        lines.append(receipt["items"][0])
    item_ids = {line["canonical_item_id"] for line in lines}
    assert len(item_ids) == 1
    return item_ids.pop(), [line["id"] for line in lines]


async def _split(client: AsyncClient, item_id: str, *splits: tuple[str, list[str]]):
    return await client.post(
        f"/api/items/{item_id}/split",
        json={"splits": [{"name": n, "line_item_ids": ids} for n, ids in splits]},
    )


async def _observations(db_session) -> int:
    return (
        await db_session.execute(select(func.count()).select_from(PriceObservation))
    ).scalar_one()


# --- AC 10, 13, 14: one line of a shared name moves -------------------------


async def test_prices_name_their_line(client):
    """AC 10: the split screen lists the item's lines; each price names its
    line and the name the receipt printed."""
    item_id, line_ids = await _olive_oil(client)

    points = (await client.get(f"/api/items/{item_id}/prices")).json()["observations"]

    assert [p["line_item_id"] for p in points] == line_ids
    assert {p["line_name"] for p in points} == {"OLIVE OIL"}


async def test_one_of_several_lines_sharing_a_name_moves_with_its_price(
    client, db_session
):
    """AC 10, 13, 14: any single line moves, though its name has others; the
    name, with lines left on both sides, stays with the original."""
    item_id, line_ids = await _olive_oil(client)
    before = await _observations(db_session)

    resp = await _split(client, item_id, ("Olive oil 3L", [line_ids[2]]))

    assert resp.status_code == 201, resp.text
    [new_item] = resp.json()["items"]
    assert new_item["canonical_name"] == "Olive oil 3L"
    assert new_item["observation_count"] == 1
    assert new_item["avg_unit_price"] == 24.99
    assert new_item["aliases"] == []
    moved = (await client.get(f"/api/items/{new_item['id']}/prices")).json()
    assert [p["line_item_id"] for p in moved["observations"]] == [line_ids[2]]
    original = (await client.get(f"/api/items/{item_id}")).json()
    assert original["observation_count"] == 2
    assert original["avg_unit_price"] == 11.74
    assert [a["alias"] for a in original["aliases"]] == ["OLIVE OIL"]
    # Nothing lost, nothing counted twice.
    assert await _observations(db_session) == before
    # The name stayed: a later scan of it joins the original.
    later = await _manual(client, "2026-03-22", ("OLIVE OIL", 11.79))
    assert later["items"][0]["canonical_item_id"] == item_id


async def test_a_name_whose_lines_all_move_goes_with_them(client):
    """AC 13: a receipt name whose lines all moved goes to the new item, and
    later scans of it match the new item."""
    receipt = await _manual(client, "2026-03-01", ("Seltzer", 1.0), ("Club Soda", 1.1))
    seltzer, club_soda = (line["canonical_item_id"] for line in receipt["items"])
    merged = await client.post(
        f"/api/items/{club_soda}/merge", json={"into_item_id": seltzer}
    )
    assert merged.status_code == 200, merged.text
    second = await _manual(client, "2026-03-05", ("Club Soda", 1.2))
    club_lines = [receipt["items"][1]["id"], second["items"][0]["id"]]

    resp = await _split(client, seltzer, ("Club soda", club_lines))

    assert resp.status_code == 201, resp.text
    [new_item] = resp.json()["items"]
    assert [a["alias"] for a in new_item["aliases"]] == ["Club Soda"]
    assert new_item["observation_count"] == 2
    original = (await client.get(f"/api/items/{seltzer}")).json()
    assert [a["alias"] for a in original["aliases"]] == ["Seltzer"]
    later = await _manual(client, "2026-03-09", ("Club Soda", 1.3))
    assert later["items"][0]["canonical_item_id"] == new_item["id"]


async def test_a_name_split_across_two_new_items_stays_with_the_original(client):
    """AC 13: the name goes along only when all its lines went to one item."""
    item_id, line_ids = await _olive_oil(client)
    await _manual(client, "2026-03-20", ("EVOO", 15.0))
    await client.post(
        f"/api/items/{(await _item_of(client, 'EVOO'))}/merge",
        json={"into_item_id": item_id},
    )

    resp = await _split(
        client,
        item_id,
        ("Olive oil 1L", line_ids[:2]),
        ("Olive oil 3L", [line_ids[2]]),
    )

    assert resp.status_code == 201, resp.text
    assert [i["aliases"] for i in resp.json()["items"]] == [[], []]
    original = (await client.get(f"/api/items/{item_id}")).json()
    assert {a["alias"] for a in original["aliases"]} == {"OLIVE OIL", "EVOO"}
    assert original["observation_count"] == 1


async def _item_of(client: AsyncClient, name: str) -> str:
    [item] = (await client.get("/api/items", params={"q": name})).json()["items"]
    return item["id"]


async def test_lines_of_a_deleted_receipt_go_with_their_name(client):
    """AC 13, no data loss: a name that moves takes its lines on Recently
    Deleted receipts too, so a restore brings the price back to the new item."""
    first = await _manual(client, "2026-03-01", ("Club Soda", 1.1), ("Seltzer", 1.0))
    soda, seltzer = (line["canonical_item_id"] for line in first["items"])
    await client.post(f"/api/items/{soda}/merge", json={"into_item_id": seltzer})
    deleted = await _manual(client, "2026-03-04", ("Club Soda", 1.2))
    assert (await client.delete(f"/api/receipts/{deleted['id']}")).status_code == 204

    resp = await _split(client, seltzer, ("Club soda", [first["items"][0]["id"]]))
    assert resp.status_code == 201, resp.text
    new_id = resp.json()["items"][0]["id"]
    restored = await client.post(f"/api/receipts/{deleted['id']}/restore")
    assert restored.status_code == 200, restored.text

    assert restored.json()["items"][0]["canonical_item_id"] == new_id
    assert (await client.get(f"/api/items/{new_id}")).json()["observation_count"] == 2
    assert (await client.get(f"/api/items/{seltzer}")).json()["observation_count"] == 1


async def test_split_into_several_new_items(client, db_session):
    """AC 11, 14: "+ Add another split": each new item is named and answered
    in the order given."""
    item_id, line_ids = await _olive_oil(client)
    await _manual(client, "2026-03-22", ("OLIVE OIL", 11.29))

    resp = await _split(
        client,
        item_id,
        (" Olive oil 3L ", [line_ids[2]]),
        ("Olive oil (Loblaws)", [line_ids[1]]),
    )

    assert resp.status_code == 201, resp.text
    items = resp.json()["items"]
    assert [i["canonical_name"] for i in items] == [
        "Olive oil 3L",
        "Olive oil (Loblaws)",
    ]
    assert [i["observation_count"] for i in items] == [1, 1]
    assert (await client.get(f"/api/items/{item_id}")).json()["observation_count"] == 2


# --- AC 14, EC-PI 6: what a split refuses ------------------------------------


async def test_the_original_must_keep_a_line(client):
    """AC 14, EC-PI 6: 409 when the original would keep no line, and for an
    item with only one line."""
    item_id, line_ids = await _olive_oil(client)

    every = await _split(client, item_id, ("A", line_ids[:2]), ("B", [line_ids[2]]))
    single = await _manual(client, "2026-03-02", ("Paprika", 3.0))
    only = await _split(
        client,
        single["items"][0]["canonical_item_id"],
        ("Smoked paprika", [single["items"][0]["id"]]),
    )

    assert every.status_code == 409
    assert only.status_code == 409
    assert (await client.get(f"/api/items/{item_id}")).json()["observation_count"] == 3


async def test_bad_splits_are_422(client):
    """AC 14: an empty name, an empty split, no split, a line that is not the
    item's, or one line twice."""
    item_id, line_ids = await _olive_oil(client)
    other = await _manual(client, "2026-03-02", ("Paprika", 3.0))
    other_line = other["items"][0]["id"]

    for body in [
        {"splits": [{"name": "  ", "line_item_ids": [line_ids[0]]}]},
        {"splits": [{"name": "Oil", "line_item_ids": []}]},
        {"splits": []},
        {"splits": [{"name": "Oil", "line_item_ids": [other_line]}]},
        {"splits": [{"name": "Oil", "line_item_ids": [str(uuid.uuid4())]}]},
        {
            "splits": [
                {"name": "A", "line_item_ids": [line_ids[0]]},
                {"name": "B", "line_item_ids": [line_ids[0]]},
            ]
        },
    ]:
        resp = await client.post(f"/api/items/{item_id}/split", json=body)
        assert resp.status_code == 422, (body, resp.text)
    assert (await client.get(f"/api/items/{item_id}")).json()["observation_count"] == 3


async def test_split_is_scoped_to_the_caller(client, client_user_b, db_session):
    """AC 14, two users: B's split of A's item is 404, and B cannot move A's
    lines into an item of B's own (422). A's item is unchanged."""
    await _act_as(db_session, DEV_USER_ID)
    item_id, line_ids = await _olive_oil(client)
    await _act_as(db_session, USER_B_ID)
    b_receipt = await _manual(
        client, "2026-03-02", ("OLIVE OIL", 9.0), ("Vinegar", 2.0)
    )
    b_item = b_receipt["items"][0]["canonical_item_id"]
    assert b_item != item_id

    foreign = await _split(client, item_id, ("Mine", [line_ids[0]]))
    stolen = await _split(client, b_item, ("Mine", [line_ids[0]]))

    assert foreign.status_code == 404
    assert stolen.status_code == 422
    await _act_as(db_session, DEV_USER_ID)
    assert (await client.get(f"/api/items/{item_id}")).json()["observation_count"] == 3


async def test_the_alias_split_stays_as_it_is(client):
    """AC 14: splitting a whole name off still works."""
    receipt = await _manual(client, "2026-03-01", ("Seltzer", 1.0), ("Club Soda", 1.1))
    seltzer, soda = (line["canonical_item_id"] for line in receipt["items"])
    body = (
        await client.post(f"/api/items/{soda}/merge", json={"into_item_id": seltzer})
    ).json()
    alias_id = next(a["id"] for a in body["aliases"] if a["alias"] == "Club Soda")

    resp = await client.post(f"/api/items/{seltzer}/aliases/{alias_id}/split")

    assert resp.status_code == 201, resp.text
    assert resp.json()["canonical_name"] == "Club Soda"


# --- AC 15: the Link items sheet --------------------------------------------


async def test_link_candidates_suggested_first_then_all_items(client):
    """AC 15: "Suggested" holds the item's pending suggestions, then the most
    similar names; "All items" the rest. The item itself is never listed,
    and each row carries its purchases and average."""
    await _manual(client, "2026-03-01", ("Cucumber", 1.0), ("Bread", 3.0))
    await _manual(client, "2026-03-02", ("Cucumber", 1.5), ("Olive oil", 12.0))
    await _manual(client, "2026-03-03", ("Rice", 4.0))
    asking = await _manual(client, "2026-03-04", ("CUCUMBERS ENG", 2.0))
    item_id = asking["items"][0]["canonical_item_id"]
    [suggestion] = (await client.get(f"/api/items/{item_id}")).json()["suggestions"]
    cucumber = suggestion["suggested_item"]["id"]

    resp = await client.get(f"/api/items/{item_id}/link-candidates")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [i["id"] for i in body["suggested"]][:1] == [cucumber]
    suggested = body["suggested"][0]
    assert suggested["observation_count"] == 2
    assert suggested["avg_unit_price"] == 1.25
    names = [i["canonical_name"] for i in body["items"]]
    assert set(names) == {"Bread", "Olive oil", "Rice"}
    every = [i["id"] for i in body["suggested"] + body["items"]]
    assert item_id not in every
    assert len(every) == len(set(every))


async def test_link_candidates_rank_similar_names(client):
    """AC 15: with no suggestion, the most similar names lead."""
    await _manual(client, "2026-03-01", ("Bread", 3.0), ("Olive oil xv", 15.0))
    source = await _manual(client, "2026-03-02", ("Olive oil 1L", 12.0))
    item_id = source["items"][0]["canonical_item_id"]

    body = (await client.get(f"/api/items/{item_id}/link-candidates")).json()

    assert [i["canonical_name"] for i in body["suggested"]] == ["Olive oil xv"]
    assert [i["canonical_name"] for i in body["items"]] == ["Bread"]


async def test_link_candidates_search(client):
    """AC 15: the search field narrows both groups."""
    await _manual(client, "2026-03-01", ("Bread", 3.0), ("Olive oil xv", 15.0))
    source = await _manual(client, "2026-03-02", ("Olive oil 1L", 12.0))
    item_id = source["items"][0]["canonical_item_id"]

    body = (
        await client.get(f"/api/items/{item_id}/link-candidates", params={"q": "bre"})
    ).json()

    assert body["suggested"] == []
    assert [i["canonical_name"] for i in body["items"]] == ["Bread"]


async def test_link_candidates_are_the_callers_own(client, client_user_b, db_session):
    """AC 15, two users: B gets 404 for A's item and never sees A's items."""
    await _act_as(db_session, DEV_USER_ID)
    a = await _manual(client, "2026-03-01", ("Olive oil", 12.0), ("Bread", 3.0))
    a_item = a["items"][0]["canonical_item_id"]
    await _act_as(db_session, USER_B_ID)
    b = await _manual(client, "2026-03-01", ("Olive oil 1L", 9.0))
    b_item = b["items"][0]["canonical_item_id"]

    foreign = await client.get(f"/api/items/{a_item}/link-candidates")
    own = (await client.get(f"/api/items/{b_item}/link-candidates")).json()

    assert foreign.status_code == 404
    assert own == {"suggested": [], "items": []}


async def test_item_list_rows_carry_their_average(
    client, mock_extractor, test_image_bytes
):
    """AC 15: "N purchases · $X avg" on each row: the mean unit price in the
    unit most of its prices are in."""
    for day, price, unit in [
        ("2026-03-01", 0.69, "lb"),
        ("2026-03-02", 0.79, "lb"),
        ("2026-03-03", 2.0, "ea"),
    ]:
        await _scan_and_confirm(
            client,
            mock_extractor,
            test_image_bytes,
            "FreshCo",
            day,
            ("Bananas", 1.0, price, unit),
        )

    [row] = (await client.get("/api/items")).json()["items"]

    assert row["observation_count"] == 3
    assert row["avg_unit_price"] == 0.74
