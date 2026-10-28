"""L2: line items keep the receipt's order.

Postgres returns rows in storage order, and an updated row moves to the end,
so an edited item jumped to the bottom. Items now carry a position, and every
read orders by it. SQLite keeps insertion order, so these tests reverse the
stored positions: only an explicit ORDER BY position passes.
"""

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import LineItem

ITEMS = [
    {"name": name, "quantity": 1, "unit_price": price, "total_price": price}
    for name, price in [("A first", 1.0), ("B second", 2.0), ("C third", 3.0)]
]


async def _manual(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Order Shop",
            "date": "2026-03-10",
            "total": 6.0,
            "items": ITEMS,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _names(client: AsyncClient, receipt_id: str) -> list[str]:
    resp = await client.get(f"/api/receipts/{receipt_id}")
    assert resp.status_code == 200
    return [i["raw_name"] for i in resp.json()["items"]]


async def test_items_are_stored_with_their_receipt_position(
    client: AsyncClient, db_session: AsyncSession
):
    await _manual(client)

    rows = await db_session.execute(
        select(LineItem.raw_name, LineItem.position).order_by(LineItem.position)
    )
    assert [tuple(r) for r in rows] == [("A first", 0), ("B second", 1), ("C third", 2)]


async def test_reads_order_items_by_position(
    client: AsyncClient, db_session: AsyncSession
):
    receipt_id = await _manual(client)
    # Store the positions against insertion order.
    for name, position in [("A first", 2), ("B second", 1), ("C third", 0)]:
        await db_session.execute(
            update(LineItem).where(LineItem.raw_name == name).values(position=position)
        )
    await db_session.flush()
    db_session.expunge_all()

    assert await _names(client, receipt_id) == ["C third", "B second", "A first"]


async def test_scanned_items_keep_the_extraction_order(
    client: AsyncClient, db_session: AsyncSession, test_image_bytes: bytes
):
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", test_image_bytes, "image/jpeg")},
    )
    assert scan.status_code == 200
    extracted = [i["name"] for i in scan.json()["extraction"]["items"]]

    rows = await db_session.execute(
        select(LineItem.raw_name).order_by(LineItem.position)
    )
    assert list(rows.scalars()) == extracted
