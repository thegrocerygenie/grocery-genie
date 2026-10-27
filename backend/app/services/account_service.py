"""Account deletion: erase a user and everything they own.

Safe to rerun. Image files go first, and a missing file is fine; then every
row goes in the caller's one transaction. A crash before the commit leaves
the rows, so the next run deletes them; a run for a user who is already gone
deletes nothing.

Kept: stores (shared across users, no user link) and the default categories.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.image.storage import (
    RECEIPT_EXTS,
    THUMBNAIL_EXT,
    FileStorage,
    generate_receipt_path,
    generate_thumbnail_path,
)
from app.models.database import (
    AuthEvent,
    Budget,
    BudgetAlertSent,
    Category,
    LineItem,
    Notification,
    PushToken,
    Receipt,
    ReceiptCorrection,
    User,
    UserItemMapping,
)
from app.services.apple_auth import AppleAccountMismatch, revoke_apple_grant

log = logging.getLogger(__name__)


class AccountDeletionError(Exception):
    """Deletion cannot go ahead; nothing was deleted."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


async def revoke_sign_in_grants(
    user: User, *, apple_authorization_code: str | None
) -> None:
    """Revoke third-party sign-in grants. Call before delete_account.

    A Sign in with Apple account must re-authenticate: the server keeps no
    Apple token, so revoking needs a fresh authorization code. Any failure
    blocks the deletion, so an account is never deleted with its grant live.
    """
    if not user.apple_subject:
        return
    if not apple_authorization_code:
        raise AccountDeletionError(
            409, "apple_reauth_required", "sign in with Apple again to delete"
        )
    try:
        await revoke_apple_grant(
            authorization_code=apple_authorization_code,
            expected_sub=user.apple_subject,
        )
    except AppleAccountMismatch as e:
        raise AccountDeletionError(
            403, "apple_account_mismatch", "that is a different Apple ID"
        ) from e
    except ValueError as e:
        log.warning("apple revoke failed for user_id=%s: %s", user.id, e)
        raise AccountDeletionError(
            502, "apple_revoke_failed", "could not reach Apple; try again"
        ) from e


async def delete_account(
    db: AsyncSession, user_id: uuid.UUID, *, storage: FileStorage
) -> None:
    """Delete the user's receipt images, then all their rows, then commit."""
    receipt_ids = list(
        (await db.execute(select(Receipt.id).where(Receipt.user_id == user_id)))
        .scalars()
        .all()
    )
    for receipt_id in receipt_ids:
        for ext in RECEIPT_EXTS:
            await storage.delete(generate_receipt_path(receipt_id, ext))
        await storage.delete(generate_thumbnail_path(receipt_id, THUMBNAIL_EXT))

    email = (
        await db.execute(select(User.email).where(User.id == user_id))
    ).scalar_one_or_none()

    owned_receipts = select(Receipt.id).where(Receipt.user_id == user_id)
    owned_budgets = select(Budget.id).where(Budget.user_id == user_id)
    # Children before parents: SQLite tests don't enforce ON DELETE CASCADE,
    # and most user FKs have none.
    statements = [
        delete(BudgetAlertSent).where(BudgetAlertSent.budget_id.in_(owned_budgets)),
        delete(ReceiptCorrection).where(
            or_(
                ReceiptCorrection.user_id == user_id,
                ReceiptCorrection.receipt_id.in_(owned_receipts),
            )
        ),
        delete(LineItem).where(LineItem.receipt_id.in_(owned_receipts)),
        delete(Receipt).where(Receipt.user_id == user_id),
        delete(Budget).where(Budget.user_id == user_id),
        delete(UserItemMapping).where(UserItemMapping.user_id == user_id),
        delete(Notification).where(Notification.user_id == user_id),
        delete(PushToken).where(PushToken.user_id == user_id),
        delete(Category).where(Category.user_id == user_id),
        delete(AuthEvent).where(AuthEvent.user_id == user_id),
    ]
    if email is not None:
        # Failed sign-ins for an unknown email log it with no user_id.
        statements.append(
            delete(AuthEvent).where(
                AuthEvent.user_id.is_(None),
                func.lower(AuthEvent.event_metadata["email"].as_string())
                == email.lower(),
            )
        )
    statements.append(delete(User).where(User.id == user_id))

    for statement in statements:
        await db.execute(statement.execution_options(synchronize_session=False))
    await db.commit()
    log.info(
        "account_deleted",
        extra={"user_id": str(user_id), "receipts": len(receipt_ids)},
    )
