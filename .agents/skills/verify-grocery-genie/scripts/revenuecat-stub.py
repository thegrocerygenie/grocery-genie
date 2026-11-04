"""A stand-in for RevenueCat's REST API v1, for `gg-verify launch --stub-revenuecat`.

It answers the two calls the backend makes: the promotional grant
(`POST /v1/subscribers/{id}/entitlements/{entitlement}/promotional`, the
waitlist's free year) and the subscriber read (`GET /v1/subscribers/{id}`,
the Premium refresh). Grants live in memory and are appended, one JSON line
each, to the log given as the third argument. While the fail-flag file exists,
grants answer 503, as an unreachable RevenueCat would. While the slow-flag file
exists, each subscriber read waits the seconds it holds before answering, as a
slow RevenueCat would: the backend makes that read while it holds user row
locks (a TRANSFER webhook), so the wait opens the window two deliveries race in.

    python revenuecat-stub.py PORT API_KEY LOG FAIL_FLAG SLOW_FLAG
"""

import json
import sys
import time
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

PORT, API_KEY, LOG, FAIL_FLAG, SLOW_FLAG = int(sys.argv[1]), *sys.argv[2:6]
GRANTS: dict[str, dict[str, int]] = {}  # app user id -> entitlement -> end_time_ms


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _subscriber(user: str) -> dict:
    return {
        "request_date_ms": int(time.time() * 1000),
        "subscriber": {
            "entitlements": {
                ent: {"expires_date": _iso(end), "product_identifier": "rc_promo_premium_custom"}
                for ent, end in GRANTS.get(user, {}).items()
            }
        },
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self) -> bool:
        if self.headers.get("Authorization") == f"Bearer {API_KEY}":
            return True
        self._send(401, {"code": 7225, "message": "Invalid API key."})
        return False

    def _parts(self) -> list[str]:
        return [unquote(p) for p in self.path.split("?")[0].strip("/").split("/")]

    def do_GET(self) -> None:  # noqa: N802
        if not self._authorized():
            return
        parts = self._parts()
        if len(parts) == 3 and parts[:2] == ["v1", "subscribers"]:
            slow = Path(SLOW_FLAG)
            if slow.exists():
                time.sleep(float(slow.read_text().strip() or 0))
            self._send(200, _subscriber(parts[2]))
            return
        self._send(404, {"message": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            return
        parts = self._parts()
        if not (
            len(parts) == 6
            and parts[:2] == ["v1", "subscribers"]
            and parts[3] == "entitlements"
            and parts[5] == "promotional"
        ):
            self._send(404, {"message": "not found"})
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        user, entitlement = parts[2], parts[4]
        failing = Path(FAIL_FLAG).exists()
        with open(LOG, "a") as log:
            log.write(
                json.dumps(
                    {
                        "app_user_id": user,
                        "entitlement": entitlement,
                        "body": body,
                        "answered": 503 if failing else 201,
                    }
                )
                + "\n"
            )
        if failing:
            self._send(503, {"message": "stub: RevenueCat unavailable"})
            return
        if "end_time_ms" not in body or "duration" in body:
            self._send(400, {"message": "stub: expected end_time_ms and no duration"})
            return
        GRANTS.setdefault(user, {})[entitlement] = int(body["end_time_ms"])
        self._send(201, _subscriber(user))

    def log_message(self, *args) -> None:
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
