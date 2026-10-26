"""BC-03: each budget threshold alerts once per budget period.

Since push delivery, every Notification row becomes a push on the user's
phone, so a repeat alert is a repeat push.
"""

import io

from httpx import AsyncClient

from app.llm.provider import MockReceiptExtractor


async def _scan_and_confirm(client: AsyncClient, image_bytes: bytes) -> None:
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(image_bytes), "image/jpeg")},
    )
    assert scan.status_code == 200
    resp = await client.patch(
        f"/api/receipts/{scan.json()['receipt_id']}", json={"status": "confirmed"}
    )
    assert resp.status_code == 200


async def _alert_thresholds(client: AsyncClient) -> list[int]:
    resp = await client.get("/api/notifications", params={"per_page": 100})
    assert resp.status_code == 200
    titles = [
        n["title"] for n in resp.json()["items"] if n["type"] == "budget_threshold"
    ]
    return sorted(
        100 if title == "Budget Exceeded" else int(title.split()[1].rstrip("%"))
        for title in titles
    )


async def _manual_entry(client: AsyncClient, amount: float) -> None:
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": "2026-03-20",
            "total": amount,
            "items": [
                {
                    "name": "Groceries",
                    "quantity": 1,
                    "unit_price": amount,
                    "total_price": amount,
                }
            ],
        },
    )
    assert resp.status_code == 201


async def _overall_budget(client: AsyncClient, amount: float) -> None:
    resp = await client.post(
        "/api/budgets",
        json={"amount": amount, "period_type": "monthly", "period_start": "2026-03-01"},
    )
    assert resp.status_code == 201


async def test_each_threshold_alerts_once_per_period(
    client: AsyncClient, test_image_bytes: bytes
):
    # The mock receipt (2026-03-15) spends $14.77 in line items.
    await _overall_budget(client, 17.0)

    await _scan_and_confirm(client, test_image_bytes)  # 87%
    assert await _alert_thresholds(client) == [50, 80]

    await _scan_and_confirm(client, test_image_bytes)  # 174%
    assert await _alert_thresholds(client) == [50, 80, 100]

    await _scan_and_confirm(client, test_image_bytes)  # 261%
    assert await _alert_thresholds(client) == [50, 80, 100]


async def test_manual_entry_alerts_once_per_threshold(client: AsyncClient):
    # Manual entry saves the receipt as confirmed, with no confirm step after.
    await _overall_budget(client, 20.0)

    await _manual_entry(client, 17.0)  # 85%
    assert await _alert_thresholds(client) == [50, 80]

    await _manual_entry(client, 1.0)  # 90%
    assert await _alert_thresholds(client) == [50, 80]


async def test_zero_budget_alerts_once_per_period(
    client: AsyncClient, test_image_bytes: bytes
):
    await _overall_budget(client, 0.0)

    await _scan_and_confirm(client, test_image_bytes)
    await _scan_and_confirm(client, test_image_bytes)

    assert await _alert_thresholds(client) == [100]


async def test_next_period_alerts_again(
    client: AsyncClient,
    test_image_bytes: bytes,
    mock_extractor: MockReceiptExtractor,
):
    await _overall_budget(client, 17.0)
    await _scan_and_confirm(client, test_image_bytes)  # March: 87%

    april = await mock_extractor.extract(b"", "image/jpeg")
    mock_extractor._result = april.model_copy(update={"date": "2026-04-10"})
    await _scan_and_confirm(client, test_image_bytes)  # April: 87%

    assert await _alert_thresholds(client) == [50, 50, 80, 80]
