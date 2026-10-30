"""Reproduce finding H1 (ConfirmAlerts NoMissedAlert) against the real backend.

Two receipts confirmed at the same time each read spend without the other, so
the 80% and 100% alerts their sum reaches are never sent.

    backend/.venv/bin/python formal/budget_alerts/repro/h1_concurrent_confirm.py [TRIALS] [--serial]

Needs a running verify-grocery-genie instance (gg-verify launch; doctor clean).
Each trial signs up a fresh user through the API, sets a 29.54 budget for this
month, scans two receipts (14.77 each: 50% alone, 100% together), and moves each
receipt's date to today on review. Only the period that holds today alerts (M5),
and the mock scan is always dated 2026-03-15. It then sends both PATCH confirms
at once from warm connections, the way two phones (or a double tap on two
receipts) would. Run one after the other, the confirms send
"Budget 80% Reached" and "Budget Exceeded"; --serial does that as a control.
"""

import asyncio
import io
import os
import random
import secrets
import sys
from datetime import date

import httpx
from PIL import Image

BASE = f"http://127.0.0.1:{os.environ.get('VERIFY_PORT', '8011')}"
EXPECTED = ["Budget 80% Reached", "Budget Exceeded"]


def receipt_photo() -> bytes:
    # Same recipe as backend/tests/conftest.py test_image_bytes.
    random.seed(42)
    img = Image.new("RGB", (400, 600), color=(240, 240, 240))
    px = img.load()
    for x in range(0, 400, 2):
        for y in range(0, 600, 2):
            v = random.randint(100, 200)
            px[x, y] = (v, v, v)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def trial(n: int, photo: bytes, serial: bool) -> bool:
    # The server's today; this script runs on the same machine.
    today = date.today()
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as setup:
        email = f"h1-{n}-{secrets.token_hex(4)}@example.com"
        # Sign-up allows 30 auth requests per IP per minute, and the counts in
        # Redis outlive a launch. A second run in the same minute waits them out.
        for _ in range(5):
            r = await setup.post(
                "/api/auth/sign-up",
                json={"email": email, "password": secrets.token_hex(16), "name": "h1"},
            )
            if r.status_code != 429:
                break
            await asyncio.sleep(int(r.headers.get("Retry-After", "10")))
        r.raise_for_status()
        auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
        # Scans need AI consent, as the app's consent sheet grants it.
        me = await setup.get("/api/users/me", headers=auth)
        me.raise_for_status()
        version = me.json()["ai_consent"]["current_policy_version"]
        r = await setup.put(
            "/api/users/me/ai-consent", headers=auth, json={"policy_version": version}
        )
        r.raise_for_status()
        r = await setup.post(
            "/api/budgets",
            headers=auth,
            json={
                "amount": 29.54,
                "period_type": "monthly",
                "period_start": today.replace(day=1).isoformat(),
            },
        )
        r.raise_for_status()
        ids = []
        for _ in range(2):
            r = await setup.post(
                "/api/receipts/scan",
                headers=auth,
                files={"file": ("receipt.jpg", photo, "image/jpeg")},
            )
            r.raise_for_status()
            rid = r.json()["receipt_id"]
            r = await setup.patch(
                f"/api/receipts/{rid}", headers=auth, json={"date": today.isoformat()}
            )
            r.raise_for_status()
            ids.append(rid)

    # One client per "device"; warm each connection so both PATCHes leave together.
    a, b = (
        httpx.AsyncClient(base_url=BASE, headers=auth, timeout=30) for _ in range(2)
    )
    async with a, b:
        await asyncio.gather(a.get("/health"), b.get("/health"))
        if serial:
            ra = await a.patch(f"/api/receipts/{ids[0]}", json={"status": "confirmed"})
            rb = await b.patch(f"/api/receipts/{ids[1]}", json={"status": "confirmed"})
        else:
            ra, rb = await asyncio.gather(
                a.patch(f"/api/receipts/{ids[0]}", json={"status": "confirmed"}),
                b.patch(f"/api/receipts/{ids[1]}", json={"status": "confirmed"}),
            )
        spend = (
            await a.get(
                "/api/dashboard/spending", params={"period": today.strftime("%Y-%m")}
            )
        ).json()
        notes = (await a.get("/api/notifications", params={"per_page": 100})).json()
    titles = sorted(i["title"] for i in notes["items"])
    ok = titles == EXPECTED
    print(
        f"trial {n}: confirms {ra.status_code} {rb.status_code}, "
        f"spend {spend['overall']['percent']}%, alerts {titles} {'ok' if ok else 'MISSED'}"
    )
    return ok


async def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--serial"]
    serial = "--serial" in sys.argv[1:]
    trials = int(args[0]) if args else 20
    photo = receipt_photo()
    results = [await trial(n, photo, serial) for n in range(1, trials + 1)]
    mode = "serial" if serial else "concurrent"
    print(f"H1 ({mode}): {results.count(False)} of {trials} trials missed an alert")


asyncio.run(main())
