"""Expo push service client.

Sends push messages through Expo (https://docs.expo.dev/push-notifications/
sending-notifications/), which forwards them to APNs. Expo returns one ticket
per message, in request order.
"""

from typing import Literal

import httpx
from pydantic import BaseModel

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
# Expo accepts at most 100 messages per request.
EXPO_MAX_BATCH = 100


class PushMessage(BaseModel):
    to: str
    title: str
    body: str
    data: dict
    sound: str = "default"


class PushTicket(BaseModel):
    status: Literal["ok", "error"]
    id: str | None = None
    message: str | None = None
    details: dict | None = None

    @property
    def error_code(self) -> str | None:
        return (self.details or {}).get("error")


class ExpoPushClient:
    def __init__(
        self,
        access_token: str | None = None,
        http: httpx.Client | None = None,
        url: str = EXPO_PUSH_URL,
    ) -> None:
        self.access_token = access_token
        self.http = http or httpx.Client(timeout=10.0)
        self.url = url

    def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        """Send up to EXPO_MAX_BATCH messages in one request; return one ticket
        per message, in order.

        The caller chunks, so it can record each request's tickets before it
        sends the next. Raises httpx.HTTPError on transport failure or a non-2xx
        response; expo_rejected() says whether a retry is safe.
        """
        if len(messages) > EXPO_MAX_BATCH:
            raise ValueError(
                f"{len(messages)} messages; Expo takes at most {EXPO_MAX_BATCH}"
            )
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        response = self.http.post(
            self.url,
            headers=headers,
            json=[m.model_dump() for m in messages],
        )
        response.raise_for_status()
        return [PushTicket.model_validate(t) for t in response.json()["data"]]


def expo_rejected(error: httpx.HTTPError) -> bool:
    """True when Expo surely took none of the request's messages, so sending
    them again cannot push twice.

    Expo documents a 4xx or 5xx response as "the entire request failed". The
    connect and pool errors fail before the request leaves this process. Any
    other error (a read timeout, a dropped connection) may come after Expo
    delivered, so the outcome is unknown.
    """
    return isinstance(
        error,
        httpx.HTTPStatusError
        | httpx.ConnectError
        | httpx.ConnectTimeout
        | httpx.PoolTimeout,
    )
