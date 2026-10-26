"""deliver_pending_pushes — sends Notification rows to devices via Expo."""

import json
import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.database import Base, Notification, PushToken, User
from app.services.push_service import ExpoPushClient, PushMessage, PushTicket
from app.tasks.push_tasks import deliver_pending_pushes

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TOKEN_A = "ExponentPushToken[phone]"
TOKEN_B = "ExponentPushToken[tablet]"


class FakePushClient:
    """Stands in for Expo's API: records messages, returns scripted tickets."""

    def __init__(self, errors: dict[str, str] | None = None, raises=None):
        self.sent: list[PushMessage] = []
        self.errors = errors or {}
        self.raises = raises

    def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        if self.raises:
            raise self.raises
        self.sent.extend(messages)
        return [
            PushTicket(status="error", details={"error": self.errors[m.to]})
            if m.to in self.errors
            else PushTicket(status="ok", id=f"ticket-{m.to}")
            for m in messages
        ]


@pytest.fixture
def db():
    engine = create_engine("sqlite://", echo=False)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        session.add(User(id=USER_ID, email="u@test.com", name="U"))
        session.commit()
        yield session
    engine.dispose()


def _notify(db, created_at=None) -> Notification:
    n = Notification(
        user_id=USER_ID,
        type="budget_threshold",
        title="Budget alert",
        body="You've used 80% of your Groceries budget.",
        data=json.dumps({"threshold": 80}),
    )
    if created_at is not None:
        n.created_at = created_at
    db.add(n)
    db.commit()
    return n


def _devices(db, *tokens):
    for t in tokens:
        db.add(PushToken(user_id=USER_ID, token=t))
    db.commit()


def _now():
    return datetime.now(UTC)


def test_sends_pending_notification_to_each_device(db):
    _devices(db, TOKEN_A, TOKEN_B)
    n = _notify(db)
    client = FakePushClient()

    deliver_pending_pushes(db, client, now=_now())

    assert sorted(m.to for m in client.sent) == [TOKEN_A, TOKEN_B]
    msg = client.sent[0]
    assert msg.title == "Budget alert"
    assert msg.body == "You've used 80% of your Groceries budget."
    assert msg.data == {
        "notification_id": str(n.id),
        "type": "budget_threshold",
        "url": "/",
    }
    db.refresh(n)
    assert n.push_status == "sent"


def test_does_not_resend_on_next_run(db):
    _devices(db, TOKEN_A)
    _notify(db)
    client = FakePushClient()

    deliver_pending_pushes(db, client, now=_now())
    deliver_pending_pushes(db, client, now=_now())

    assert len(client.sent) == 1


def test_user_without_devices_is_marked_no_device(db):
    n = _notify(db)
    client = FakePushClient()

    deliver_pending_pushes(db, client, now=_now())

    assert client.sent == []
    db.refresh(n)
    assert n.push_status == "no_device"


def test_unregistered_device_token_is_removed(db):
    _devices(db, TOKEN_A, TOKEN_B)
    n = _notify(db)
    client = FakePushClient(errors={TOKEN_B: "DeviceNotRegistered"})

    deliver_pending_pushes(db, client, now=_now())

    remaining = db.execute(select(PushToken.token)).scalars().all()
    assert remaining == [TOKEN_A]
    db.refresh(n)
    assert n.push_status == "sent"  # reached at least one device


def test_all_devices_failing_marks_failed(db):
    _devices(db, TOKEN_A)
    n = _notify(db)
    client = FakePushClient(errors={TOKEN_A: "MessageTooBig"})

    deliver_pending_pushes(db, client, now=_now())

    db.refresh(n)
    assert n.push_status == "failed"
    assert db.execute(select(PushToken.token)).scalars().all() == [TOKEN_A]


def test_transport_error_leaves_notification_pending_for_retry(db):
    _devices(db, TOKEN_A)
    n = _notify(db)
    client = FakePushClient(raises=httpx.ConnectError("down"))

    deliver_pending_pushes(db, client, now=_now())

    db.refresh(n)
    assert n.push_status is None


def test_stale_notification_expires_instead_of_sending_late(db):
    _devices(db, TOKEN_A)
    n = _notify(db, created_at=_now() - timedelta(hours=2))
    client = FakePushClient()

    deliver_pending_pushes(db, client, now=_now())

    assert client.sent == []
    db.refresh(n)
    assert n.push_status == "expired"


# --- At most once under faults (findings H2 and H2b, formal/budget_alerts) ---
# These drive the real ExpoPushClient; only the network is an httpx.MockTransport.
# `accepted` counts each (notification id, token) message Expo took: above 1 is a
# duplicate push on the user's phone.


def _expo(accepted: Counter, mode: str = "ok") -> ExpoPushClient:
    """Stand-in for Expo. mode: ok | lost | second-request-503."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if mode == "second-request-503" and calls["n"] >= 2:
            return httpx.Response(503, json={"errors": [{"message": "unavailable"}]})
        messages = json.loads(request.content)
        for m in messages:
            accepted[(m["data"]["notification_id"], m["to"])] += 1
        if mode == "lost":
            raise httpx.ReadTimeout("Expo took it; response lost", request=request)
        return httpx.Response(
            200, json={"data": [{"status": "ok", "id": "t"} for _ in messages]}
        )

    return ExpoPushClient(http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_lost_response_is_not_sent_again(db):
    _devices(db, TOKEN_A)
    n = _notify(db)
    accepted: Counter = Counter()

    deliver_pending_pushes(db, _expo(accepted, "lost"), now=_now())
    deliver_pending_pushes(db, _expo(accepted), now=_now())

    assert accepted == {(str(n.id), TOKEN_A): 1}
    db.refresh(n)
    assert n.push_status == "failed"  # outcome unknown: never retried


def test_failed_chunk_keeps_earlier_chunks_and_retries_only_the_rest(db):
    # 60 notifications x 2 devices = 120 messages: two Expo requests.
    _devices(db, TOKEN_A, TOKEN_B)
    ids = {str(_notify(db).id) for _ in range(60)}
    accepted: Counter = Counter()

    deliver_pending_pushes(db, _expo(accepted, "second-request-503"), now=_now())
    deliver_pending_pushes(db, _expo(accepted), now=_now())

    assert {nid for nid, _ in accepted} == ids
    assert len(accepted) == 120
    assert max(accepted.values()) == 1
    statuses = db.execute(select(Notification.push_status)).scalars().all()
    assert set(statuses) == {"sent"}


def test_failed_commit_after_send_is_not_sent_again(db):
    _devices(db, TOKEN_A)
    n = _notify(db)
    accepted: Counter = Counter()
    real_commit = db.commit

    def commit_then_die() -> None:
        if accepted:  # the first commit after Expo took the message fails
            raise RuntimeError("worker died before commit")
        real_commit()

    db.commit = commit_then_die
    with pytest.raises(RuntimeError):
        deliver_pending_pushes(db, _expo(accepted), now=_now())
    db.rollback()
    db.commit = real_commit
    deliver_pending_pushes(db, _expo(accepted), now=_now())

    assert accepted == {(str(n.id), TOKEN_A): 1}


def test_row_left_sending_by_a_dead_run_settles_as_failed(db):
    _devices(db, TOKEN_A)
    n = _notify(db, created_at=_now() - timedelta(hours=2))
    n.push_status = "sending"
    db.commit()
    accepted: Counter = Counter()

    deliver_pending_pushes(db, _expo(accepted), now=_now())

    assert accepted == {}
    db.refresh(n)
    assert n.push_status == "failed"


def test_refused_request_is_retried_next_run(db):
    _devices(db, TOKEN_A)
    n = _notify(db)
    accepted: Counter = Counter()

    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"errors": [{"message": "slow down"}]})

    refusing = ExpoPushClient(http=httpx.Client(transport=httpx.MockTransport(refuse)))
    deliver_pending_pushes(db, refusing, now=_now())
    db.refresh(n)
    assert n.push_status is None

    deliver_pending_pushes(db, _expo(accepted), now=_now())
    assert accepted == {(str(n.id), TOKEN_A): 1}
    db.refresh(n)
    assert n.push_status == "sent"


def test_beat_runs_push_delivery_every_minute():
    from app.tasks.celery_app import celery_app

    entry = celery_app.conf.beat_schedule["deliver-pending-pushes"]
    assert entry["task"] == "app.tasks.push_tasks.deliver_pending_pushes"
    assert entry["schedule"] == 60.0

    celery_app.loader.import_default_modules()
    assert "app.tasks.push_tasks.deliver_pending_pushes" in celery_app.tasks
