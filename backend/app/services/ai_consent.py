"""Consent to send receipts to third-party AI (App Store 5.1.2(i)).

A scan sends the receipt photo, and the item names on it, to Anthropic
through app/llm/provider.py. The user must allow this first. Consent
belongs to the account, so it follows the user to a new device, and it
counts only for the policy version the app showed: a new version asks
again.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException

from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import AiConsentPublic

logger = logging.getLogger(__name__)

# Bump when the consent sheet's text changes what is sent, to whom, or why.
# Every user is then asked again. Keep in step with the app's copy
# (mobile/src/features/ai-consent/constants.ts).
AI_CONSENT_POLICY_VERSION = "2026-10-27"

CONSENT_REQUIRED_MESSAGE = (
    "Reading a receipt sends its photo and item names to Anthropic's Claude AI. "
    "Allow this in the app first, or enter the receipt manually."
)


class ConsentVersionMismatchError(Exception):
    """The app showed a policy version that is not the current one."""


def has_ai_consent(user: User) -> bool:
    return (
        user.ai_consent_at is not None
        and user.ai_consent_version == AI_CONSENT_POLICY_VERSION
    )


def public(user: User) -> AiConsentPublic:
    return AiConsentPublic(
        granted=has_ai_consent(user),
        granted_at=user.ai_consent_at,
        policy_version=user.ai_consent_version,
        current_policy_version=AI_CONSENT_POLICY_VERSION,
    )


def grant(user: User, policy_version: str) -> None:
    """Record consent. Idempotent: a repeat keeps the first time."""
    if policy_version != AI_CONSENT_POLICY_VERSION:
        raise ConsentVersionMismatchError(policy_version)
    if has_ai_consent(user):
        return
    user.ai_consent_at = datetime.now(UTC)
    user.ai_consent_version = policy_version
    logger.info(
        "ai_consent_granted",
        extra={"user_id": str(user.id), "policy_version": policy_version},
    )


def withdraw(user: User) -> None:
    """Withdraw consent. Idempotent."""
    if user.ai_consent_at is None and user.ai_consent_version is None:
        return
    user.ai_consent_at = None
    user.ai_consent_version = None
    logger.info("ai_consent_withdrawn", extra={"user_id": str(user.id)})


async def require_ai_consent(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Route dependency: refuse with 403 until the user has consented."""
    if not has_ai_consent(user):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ai_consent_required",
                "message": CONSENT_REQUIRED_MESSAGE,
                "policy_version": AI_CONSENT_POLICY_VERSION,
            },
        )
    return user
