"""Allowlist of analytics events the client may submit via the ingestion API.

Kept deliberately minimal: the backend already emits every server-observable
event itself, so a client only needs to deliver events the backend cannot see.
Restricting the allowlist prevents an authenticated user from injecting
server-owned events (e.g. ``budget_created``, ``receipt_confirmed``) and
skewing product funnels.
"""

# Events the client is permitted to POST to /api/analytics/events.
CLIENT_EMITTABLE_EVENTS: frozenset[str] = frozenset({"receipt_abandoned"})
