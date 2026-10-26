"""Reproduce findings H2 and H2b (PushDelivery PushAtMostOnce) against the real push code.

    backend/.venv/bin/python formal/budget_alerts/repro/h2_push_resend.py

Runs app.tasks.push_tasks.deliver_pending_pushes with the real ExpoPushClient on
the database of a running verify-grocery-genie instance (gg-verify launch).
Only the network is replaced: an httpx.MockTransport stands in for Expo and
records every message it accepts. Users and device tokens go through the API;
notification rows are inserted directly, because the scenarios are about
delivery, not creation. The script first delivers any rows already pending, so
each scenario sees only its own.

Each scenario runs the task once with a fault, then once more with Expo healthy:
  lost    Expo accepts the request, then the response times out (httpx.ReadTimeout)
  chunks  60 notifications x 2 devices = 120 messages, so two Expo requests;
          the second gets HTTP 503
  crash   Expo answers ok, then db.commit() fails (worker killed, DB error)
A message Expo accepts twice is a duplicate push on the user's phone.
"""

import os
import secrets
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend"))
DB = os.environ.get("VERIFY_DB", "gg_verify")
os.environ["GG_DATABASE_URL"] = (
    f"postgresql+asyncpg://grocery_genie:grocery_genie_dev@localhost:54440/{DB}"
)
BASE = f"http://127.0.0.1:{os.environ.get('VERIFY_PORT', '8011')}"

from app.core.dependencies import get_sync_session_factory
from app.models.database import Notification
from app.services.push_service import ExpoPushClient
from app.tasks.push_tasks import deliver_pending_pushes
from sqlalchemy import func, select

Session = get_sync_session_factory()
accepted: Counter = (
    Counter()
)  # (notification_id, device token) -> times Expo accepted it


def expo(mode: str):
    """A stand-in for Expo's /push/send. mode: ok | lost | second-request-503."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if mode == "second-request-503" and calls["n"] >= 2:
            return httpx.Response(503, json={"errors": [{"message": "unavailable"}]})
        messages = httpx.Response(200, content=request.content).json()
        for m in messages:
            accepted[(m["data"]["notification_id"], m["to"])] += 1
        if mode == "lost":
            raise httpx.ReadTimeout(
                "response lost after Expo accepted", request=request
            )
        return httpx.Response(
            200,
            json={
                "data": [{"status": "ok", "id": secrets.token_hex(4)} for _ in messages]
            },
        )

    return ExpoPushClient(http=httpx.Client(transport=httpx.MockTransport(handler)))


def run_task(client: ExpoPushClient, fail_commit: bool = False) -> None:
    with Session() as db:
        if fail_commit:

            def commit() -> None:
                raise RuntimeError("worker died before commit")

            db.commit = commit
        try:
            deliver_pending_pushes(db, client, now=datetime.now(UTC))
        except RuntimeError as e:
            print(f"    task raised: {e}")


def user_with_devices(devices: int) -> str:
    with httpx.Client(base_url=BASE, timeout=30) as api:
        r = api.post(
            "/api/auth/sign-up",
            json={
                "email": f"h2-{secrets.token_hex(4)}@example.com",
                "password": secrets.token_hex(16),
                "name": "h2",
            },
        )
        r.raise_for_status()
        auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
        for _ in range(devices):
            token = f"ExponentPushToken[h2-{secrets.token_hex(6)}]"
            api.post(
                "/api/users/me/push-tokens", headers=auth, json={"token": token}
            ).raise_for_status()
        return api.get("/api/users/me", headers=auth).json()["id"]


def notifications(user_id: str, count: int) -> list[str]:
    with Session() as db:
        rows = [
            Notification(
                user_id=user_id,
                type="budget_threshold",
                title="Budget 80% Reached",
                body="h2",
            )
            for _ in range(count)
        ]
        db.add_all(rows)
        db.commit()
        return [str(r.id) for r in rows]


def pending() -> int:
    with Session() as db:
        return db.scalar(select(func.count()).where(Notification.push_status.is_(None)))


def scenario(name: str, devices: int, count: int, fault) -> bool:
    ids = set(notifications(user_with_devices(devices), count))
    fault()
    run_task(expo("ok"))
    mine = {k: v for k, v in accepted.items() if k[0] in ids}
    dupes = sum(1 for v in mine.values() if v > 1)
    with Session() as db:
        statuses = Counter(
            db.scalars(
                select(Notification.push_status).where(Notification.id.in_(list(ids)))
            ).all()
        )
    print(
        f"{name}: {count} notifications x {devices} device(s); "
        f"{len(mine)} messages accepted, {dupes} of them twice; final push_status {dict(statuses)}"
    )
    return dupes > 0


def main() -> None:
    for _ in range(20):
        if not pending():
            break
        run_task(expo("ok"))
    assert pending() == 0, (
        "could not drain the pending notifications already in the database"
    )
    accepted.clear()
    results = [
        scenario("lost", 1, 2, lambda: run_task(expo("lost"))),
        scenario("chunks", 2, 60, lambda: run_task(expo("second-request-503"))),
        scenario("crash", 1, 2, lambda: run_task(expo("ok"), fail_commit=True)),
    ]
    print(f"H2: {sum(results)} of {len(results)} scenarios pushed a message twice")


main()
