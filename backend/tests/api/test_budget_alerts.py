"""BC-03: each budget threshold alerts once per budget period.

Since push delivery, every Notification row becomes a push on the user's
phone, so a repeat alert is a repeat push.
"""

import io
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories
from app.llm.provider import MockReceiptExtractor
from app.models.database import BudgetAlertSent


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


async def _manual_entry(
    client: AsyncClient, amount: float, on: str = "2026-03-20"
) -> None:
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": on,
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


async def _overall_budget(
    client: AsyncClient, amount: float, period_start: str = "2026-03-01"
) -> None:
    resp = await client.post(
        "/api/budgets",
        json={
            "amount": amount,
            "period_type": "monthly",
            "period_start": period_start,
        },
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


async def test_editing_a_saved_receipt_alerts_on_newly_crossed_thresholds(
    client: AsyncClient,
):
    # Editing a confirmed receipt sends only corrections (no status), so it
    # does not confirm again. It must still alert when the edit crosses a
    # threshold, and never twice for the same one.
    await _overall_budget(client, 20.0)
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": "2026-03-20",
            "total": 9.0,
            "items": [
                {
                    "name": "Groceries",
                    "quantity": 1,
                    "unit_price": 9.0,
                    "total_price": 9.0,
                }
            ],
        },
    )
    receipt_id = resp.json()["id"]
    item_id = resp.json()["items"][0]["id"]
    assert await _alert_thresholds(client) == []  # 45%

    async def edit_price(amount: float) -> None:
        resp = await client.patch(
            f"/api/receipts/{receipt_id}",
            json={"items": [{"id": item_id, "total_price": amount}]},
        )
        assert resp.status_code == 200

    await edit_price(17.0)  # 85%
    assert await _alert_thresholds(client) == [50, 80]

    await edit_price(18.0)  # 90%
    assert await _alert_thresholds(client) == [50, 80]

    await edit_price(25.0)  # 125%
    assert await _alert_thresholds(client) == [50, 80, 100]


async def test_editing_an_unconfirmed_scan_does_not_alert(
    client: AsyncClient, test_image_bytes: bytes
):
    # Spend counts confirmed receipts only, and a scan under review is not one.
    await _overall_budget(client, 10.0)
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )
    resp = await client.patch(
        f"/api/receipts/{scan.json()['receipt_id']}", json={"store_name": "Renamed"}
    )
    assert resp.status_code == 200
    assert await _alert_thresholds(client) == []


async def test_confirming_twice_does_not_confirm_again(
    client: AsyncClient, test_image_bytes: bytes, monkeypatch
):
    # A second "confirmed" would dispatch ReceiptConfirmed again, and every
    # handler of it (budget, mappings, pantry) would run twice.
    from app.events import dispatcher as dispatcher_module
    from app.events.types import ReceiptConfirmed

    dispatched: list[ReceiptConfirmed] = []
    original = dispatcher_module.dispatcher.dispatch

    def spy(event):
        if isinstance(event, ReceiptConfirmed):
            dispatched.append(event)
        return original(event)

    monkeypatch.setattr(dispatcher_module.dispatcher, "dispatch", spy)
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )
    receipt_url = f"/api/receipts/{scan.json()['receipt_id']}"

    await client.patch(receipt_url, json={"status": "confirmed"})
    resp = await client.patch(receipt_url, json={"status": "confirmed"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "confirmed"
    assert len(dispatched) == 1


async def _claimed_period_starts(db_session: AsyncSession) -> list[date]:
    result = await db_session.execute(select(BudgetAlertSent.period_start))
    return sorted(set(result.scalars().all()))


# A budget period runs from the reset day (the overall budget's period_start
# day) to the day before it next month. A receipt dated before the reset day
# belongs to the period that started last month, so its alerts must count
# that period's spend.
@pytest.mark.parametrize(
    ("period_start", "dates", "expected_alerts", "claimed_period"),
    [
        pytest.param(
            "2026-02-15",
            ["2026-03-10"],
            [50, 80],
            date(2026, 2, 15),
            id="reset-15-receipt-before-reset-day",
        ),
        pytest.param(
            "2026-02-15",
            ["2026-02-20", "2026-03-10"],
            [50, 80, 100],
            date(2026, 2, 15),
            id="reset-15-receipts-either-side-of-month-end-share-a-period",
        ),
        pytest.param(
            "2026-01-28",
            ["2026-02-27"],
            [50, 80],
            date(2026, 1, 28),
            id="reset-28-february-27-is-in-january-period",
        ),
        pytest.param(
            "2026-01-31",
            ["2026-02-28", "2026-03-30"],
            [50, 80, 100],
            date(2026, 2, 28),
            id="reset-31-clamps-to-february-28",
        ),
        pytest.param(
            "2025-12-15",
            ["2025-12-20", "2026-01-10"],
            [50, 80, 100],
            date(2025, 12, 15),
            id="reset-15-december-period-wraps-into-january",
        ),
    ],
)
async def test_receipt_alerts_in_the_period_that_holds_its_date(
    client: AsyncClient,
    db_session: AsyncSession,
    period_start: str,
    dates: list[str],
    expected_alerts: list[int],
    claimed_period: date,
):
    await _overall_budget(client, 20.0, period_start=period_start)
    amount = 17.0 if len(dates) == 1 else 10.0  # 85%, or 50% each

    for on in dates:
        await _manual_entry(client, amount, on=on)

    assert await _alert_thresholds(client) == expected_alerts
    assert await _claimed_period_starts(db_session) == [claimed_period]


async def test_receipts_on_either_side_of_the_reset_day_are_separate_periods(
    client: AsyncClient, db_session: AsyncSession
):
    await _overall_budget(client, 20.0, period_start="2026-02-15")

    await _manual_entry(client, 10.0, on="2026-03-14")  # Feb 15 - Mar 14: 50%
    await _manual_entry(client, 10.0, on="2026-03-15")  # Mar 15 - Apr 14: 50%

    assert await _alert_thresholds(client) == [50, 50]
    assert await _claimed_period_starts(db_session) == [
        date(2026, 2, 15),
        date(2026, 3, 15),
    ]


@pytest.fixture
async def seeded_categories(db_session: AsyncSession) -> None:
    await seed_default_categories(db_session)


async def _category_id(client: AsyncClient, name: str) -> str:
    resp = await client.get("/api/categories")
    assert resp.status_code == 200
    return next(c["id"] for c in resp.json() if c["name"] == name)


# A category correction recategorizes every line item with the same name, in
# all of the user's receipts. Spend then moves in each period that holds one
# of those receipts, so each such period must alert, not only the period of
# the receipt that was edited.
@pytest.mark.parametrize(
    "edited",
    [
        pytest.param("confirmed", id="edit-a-saved-receipt"),
        pytest.param("under-review", id="edit-a-scan-under-review"),
        pytest.param("confirm-with-edit", id="confirm-a-scan-with-the-edit"),
    ],
)
async def test_category_correction_alerts_in_every_period_it_moves_spend(
    client: AsyncClient,
    db_session: AsyncSession,
    test_image_bytes: bytes,
    seeded_categories,
    monkeypatch,
    edited: str,
):
    # check_thresholds locks the user's budget rows. A second lock pass in one
    # request could deadlock with a concurrent confirm, so the edit must check
    # every changed period in one call.
    from app.services.budget_service import BudgetService

    calls: list[tuple] = []
    original = BudgetService.check_thresholds

    async def spy(self, user_id, *dates):
        calls.append(dates)
        return await original(self, user_id, *dates)

    monkeypatch.setattr(BudgetService, "check_thresholds", spy)
    snacks = await _category_id(client, "Snacks & Treats")
    other = await _category_id(client, "Other")
    resp = await client.post(
        "/api/budgets",
        json={
            "category_id": snacks,
            "amount": 20.0,
            "period_type": "monthly",
            "period_start": "2026-02-01",
        },
    )
    assert resp.status_code == 201

    # February: $17 of "Organic Bananas", filed under Other. Snacks is at 0%.
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Corner Shop",
            "date": "2026-02-20",
            "total": 17.0,
            "items": [
                {
                    "name": "Organic Bananas",
                    "quantity": 1,
                    "unit_price": 17.0,
                    "total_price": 17.0,
                    "category_id": other,
                }
            ],
        },
    )
    assert resp.status_code == 201

    # March (2026-03-15): the mock scan has $1.29 of "Organic Bananas".
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )
    receipt_url = f"/api/receipts/{scan.json()['receipt_id']}"
    if edited == "confirmed":
        resp = await client.patch(receipt_url, json={"status": "confirmed"})
        assert resp.status_code == 200
    items = (await client.get(receipt_url)).json()["items"]
    bananas = next(i["id"] for i in items if i["raw_name"] == "Organic Bananas")
    assert await _alert_thresholds(client) == []

    body: dict = {"items": [{"id": bananas, "category_id": snacks}]}
    if edited == "confirm-with-edit":
        body["status"] = "confirmed"
    calls.clear()
    resp = await client.patch(receipt_url, json=body)
    assert resp.status_code == 200
    assert len(calls) == 1

    # February Snacks is now $17 of $20 (85%). March Snacks is under 50%.
    assert await _alert_thresholds(client) == [50, 80]
    assert await _claimed_period_starts(db_session) == [date(2026, 2, 1)]


@pytest.mark.parametrize("status", ["pending_review", "pending", "archived"])
async def test_a_confirmed_receipt_cannot_leave_confirmed(
    client: AsyncClient, test_image_bytes: bytes, monkeypatch, status: str
):
    # Moving a confirmed receipt out of confirmed and back would confirm it
    # again, and dispatch ReceiptConfirmed a second time.
    from app.events import dispatcher as dispatcher_module
    from app.events.types import ReceiptConfirmed

    dispatched: list[ReceiptConfirmed] = []
    original = dispatcher_module.dispatcher.dispatch

    def spy(event):
        if isinstance(event, ReceiptConfirmed):
            dispatched.append(event)
        return original(event)

    monkeypatch.setattr(dispatcher_module.dispatcher, "dispatch", spy)
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )
    receipt_url = f"/api/receipts/{scan.json()['receipt_id']}"
    resp = await client.patch(receipt_url, json={"status": "confirmed"})
    assert resp.status_code == 200

    resp = await client.patch(receipt_url, json={"status": status})
    assert resp.status_code == 422
    assert (await client.get(receipt_url)).json()["status"] == "confirmed"

    resp = await client.patch(receipt_url, json={"status": "confirmed"})
    assert resp.status_code == 200
    assert len(dispatched) == 1


async def test_status_accepts_only_known_values(
    client: AsyncClient, test_image_bytes: bytes
):
    scan = await client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
    )
    receipt_url = f"/api/receipts/{scan.json()['receipt_id']}"

    resp = await client.patch(receipt_url, json={"status": "archived"})
    assert resp.status_code == 422

    resp = await client.patch(receipt_url, json={"status": "pending_review"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending_review"
