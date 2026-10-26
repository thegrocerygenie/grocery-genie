"""ExpoPushClient — talks to Expo's push API (tested with httpx.MockTransport)."""

import json

import httpx
import pytest

from app.services.push_service import (
    EXPO_PUSH_URL,
    ExpoPushClient,
    PushMessage,
    expo_rejected,
)


def _client(handler, access_token=None) -> ExpoPushClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return ExpoPushClient(access_token=access_token, http=http)


def _msg(n: int = 0) -> PushMessage:
    return PushMessage(
        to=f"ExponentPushToken[{n}]", title="T", body="B", data={"k": "v"}
    )


def test_posts_messages_and_parses_tickets():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(
            200,
            json={
                "data": [
                    {"status": "ok", "id": "ticket-1"},
                    {
                        "status": "error",
                        "message": "not registered",
                        "details": {"error": "DeviceNotRegistered"},
                    },
                ]
            },
        )

    tickets = _client(handler).send([_msg(0), _msg(1)])

    assert seen["url"] == EXPO_PUSH_URL
    assert seen["auth"] is None
    assert seen["body"][0] == {
        "to": "ExponentPushToken[0]",
        "title": "T",
        "body": "B",
        "data": {"k": "v"},
        "sound": "default",
    }
    assert [t.status for t in tickets] == ["ok", "error"]
    assert tickets[1].error_code == "DeviceNotRegistered"


def test_sends_access_token_when_configured():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"data": [{"status": "ok", "id": "t"}]})

    _client(handler, access_token="secret").send([_msg()])

    assert seen["auth"] == "Bearer secret"


def test_one_request_per_send_and_refuses_more_than_expo_limit():
    # The caller chunks, so it can record each request's tickets before the next.
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        batch = json.loads(request.content)
        calls.append(len(batch))
        return httpx.Response(
            200, json={"data": [{"status": "ok", "id": "t"} for _ in batch]}
        )

    client = _client(handler)
    assert len(client.send([_msg(i) for i in range(100)])) == 100
    with pytest.raises(ValueError):
        client.send([_msg(i) for i in range(101)])
    assert calls == [100]


@pytest.mark.parametrize(
    ("error", "rejected"),
    [
        (httpx.ConnectError("down"), True),
        (httpx.ConnectTimeout("slow connect"), True),
        (httpx.PoolTimeout("no connection"), True),
        (httpx.ReadTimeout("response lost"), False),
        (httpx.RemoteProtocolError("dropped"), False),
        (httpx.WriteTimeout("half sent"), False),
    ],
)
def test_expo_rejected_only_when_nothing_can_have_been_delivered(error, rejected):
    assert expo_rejected(error) is rejected


def test_expo_rejected_on_any_error_status():
    # Expo documents a 4xx or 5xx as "the entire request failed".
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"errors": [{"message": "slow down"}]})

    with pytest.raises(httpx.HTTPStatusError) as exc:
        _client(handler).send([_msg()])
    assert expo_rejected(exc.value) is True


def test_raises_on_server_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"errors": [{"message": "down"}]})

    with pytest.raises(httpx.HTTPStatusError):
        _client(handler).send([_msg()])
