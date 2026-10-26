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
        """Send messages; return one ticket per message, in order.

        Raises httpx.HTTPError on transport failure or a non-2xx response, so
        the caller can leave the work pending and retry.
        """
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        tickets: list[PushTicket] = []
        for start in range(0, len(messages), EXPO_MAX_BATCH):
            batch = messages[start : start + EXPO_MAX_BATCH]
            response = self.http.post(
                self.url,
                headers=headers,
                json=[m.model_dump() for m in batch],
            )
            response.raise_for_status()
            tickets.extend(
                PushTicket.model_validate(t) for t in response.json()["data"]
            )
        return tickets
