"""The waitlist's free year of Premium (V11-P5, decisions #9-#13).

waitlist_entries is the copy of the marketing site's waitlist (the Resend
audience), trimmed and lowercased emails with each contact's created_at and
unsubscribed flag; it is deleted when the claim window closes.

waitlist_redemptions is one free year per waitlist email, ever: a salted,
one-way hash of the waitlist email (unique), the account (unique, null once
the account is deleted), and the RevenueCat grant's state (pending ->
granted) for retries.

users gets the "Claim your waitlist offer" confirmation, like pending_email:
the waitlist email, its link's token hash and expiry.

Revision ID: 20261104_0020
Revises: 20261104_0019
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0020"
down_revision: str | None = "20261104_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("waitlist_claim_email", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("waitlist_claim_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "waitlist_claim_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )

    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("contact_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "unsubscribed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "waitlist_redemptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("grant_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "attempts", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email_hash"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("waitlist_redemptions")
    op.drop_table("waitlist_entries")
    op.drop_column("users", "waitlist_claim_expires_at")
    op.drop_column("users", "waitlist_claim_token_hash")
    op.drop_column("users", "waitlist_claim_email")
