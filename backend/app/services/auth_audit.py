"""Audit logger for security-relevant auth events.

Writes to the `auth_events` table and also emits a structured log line so
ops can alert on credential stuffing without paging through the DB.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AuthEvent

log = logging.getLogger("auth_audit")


EVENT_SIGNUP = "signup"
EVENT_SIGNIN_SUCCESS = "signin_success"
EVENT_SIGNIN_FAILURE = "signin_failure"
EVENT_SIGNOUT = "signout"
EVENT_PASSWORD_RESET_REQUEST = "password_reset_request"
EVENT_PASSWORD_RESET_COMPLETE = "password_reset_complete"
EVENT_PASSWORD_CHANGE = "password_change"
EVENT_EMAIL_VERIFY = "email_verify"
EVENT_EMAIL_VERIFY_RESEND = "email_verify_resend"
EVENT_EMAIL_CHANGE_REQUEST = "email_change_request"
EVENT_EMAIL_CHANGE_COMPLETE = "email_change_complete"
EVENT_SOCIAL_LINK = "social_link"
EVENT_LOCKOUT = "lockout"
EVENT_TOKEN_REUSE_DETECTED = "token_reuse_detected"


async def record(
    db: AsyncSession,
    *,
    event_type: str,
    user_id: uuid.UUID | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    event = AuthEvent(
        user_id=user_id,
        event_type=event_type,
        ip=ip,
        user_agent=user_agent,
        event_metadata=metadata,
    )
    db.add(event)
    await db.flush()
    log.info(
        "auth_event",
        extra={
            "event_type": event_type,
            "user_id": str(user_id) if user_id else None,
            "ip": ip,
            "metadata": metadata,
        },
    )
