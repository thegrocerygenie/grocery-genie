"""Where the waitlist comes from: the marketing site's Resend audience (V11-P5).

The site (``marketing/api/_handler.js``) adds each sign-up to the Resend
audience ``RESEND_AUDIENCE_ID``, email trimmed and lowercased. The backend
copies it into ``waitlist_entries`` either through Resend's API
(``ResendAudienceClient``, the daily task) or from a one-off CSV export of
the audience taken at the cut-off (``parse_export_csv``, the management
command). Unsubscribed contacts are kept: they still qualify (decision #10).
A contact deleted from the audience (a deletion request) leaves the copy on
the next sync, and with it the offer.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from pydantic import BaseModel, ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import WaitlistEntry

logger = logging.getLogger(__name__)

PAGE_SIZE = 100


class WaitlistSourceError(Exception):
    """The waitlist could not be read; nothing was changed."""


class WaitlistContact(BaseModel):
    email: str
    created_at: datetime
    unsubscribed: bool = False


def parse_timestamp(value: str) -> datetime:
    """Resend's timestamps: ISO 8601, sometimes with a space and a ``+00``
    offset ("2026-11-03 18:15:01.123+00"). Naive means UTC."""
    text = value.strip().replace("Z", "+00:00")
    if len(text) >= 3 and text[-3] in "+-" and text[-3:][1:].isdigit():
        text += ":00"
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _contact(email: str, created_at: str, unsubscribed: object) -> WaitlistContact:
    if isinstance(unsubscribed, str):
        unsubscribed = unsubscribed.strip().lower() in {"true", "1", "yes"}
    return WaitlistContact(
        email=email.strip().lower(),
        created_at=parse_timestamp(created_at),
        unsubscribed=bool(unsubscribed),
    )


class _ContactRow(BaseModel):
    id: str
    email: str
    created_at: str
    unsubscribed: bool = False


class _ContactPage(BaseModel):
    data: list[_ContactRow]
    has_more: bool = False


class ResendAudienceClient:
    """Lists the contacts of one Resend audience, page by page."""

    def __init__(
        self,
        api_key: str,
        audience_id: str,
        base_url: str = "https://api.resend.com",
        http: httpx.AsyncClient | None = None,
        page_delay: float = 0.6,
    ) -> None:
        self.api_key = api_key
        self.audience_id = audience_id
        self.base_url = base_url.rstrip("/")
        self.http = http
        # Resend allows a few requests a second per team.
        self.page_delay = page_delay

    async def _get(self, url: str, params: dict) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if self.http is not None:
            return await self.http.get(url, headers=headers, params=params)
        async with httpx.AsyncClient(timeout=20.0) as http:
            return await http.get(url, headers=headers, params=params)

    async def list_contacts(self) -> list[WaitlistContact]:
        url = f"{self.base_url}/audiences/{self.audience_id}/contacts"
        contacts: list[WaitlistContact] = []
        after: str | None = None
        while True:
            params: dict = {"limit": PAGE_SIZE}
            if after is not None:
                params["after"] = after
            try:
                resp = await self._get(url, params)
                resp.raise_for_status()
                page = _ContactPage.model_validate(resp.json())
                contacts.extend(
                    _contact(row.email, row.created_at, row.unsubscribed)
                    for row in page.data
                )
            except (httpx.HTTPError, ValueError, ValidationError) as e:
                logger.warning("resend audience read failed: %s", type(e).__name__)
                raise WaitlistSourceError(str(e)) from e
            if not page.has_more or not page.data:
                return contacts
            after = page.data[-1].id
            if self.page_delay:
                await asyncio.sleep(self.page_delay)


def parse_export_csv(text: str) -> list[WaitlistContact]:
    """Contacts from a Resend audience CSV export (columns ``email``,
    ``created_at`` and, optionally, ``unsubscribed``); blank rows skipped."""
    reader = csv.DictReader(io.StringIO(text))
    fields = {name.strip().lower() for name in reader.fieldnames or []}
    if not {"email", "created_at"} <= fields:
        raise WaitlistSourceError("the export needs email and created_at columns")
    contacts: list[WaitlistContact] = []
    for raw in reader:
        row = {(k or "").strip().lower(): (v or "") for k, v in raw.items()}
        if not row.get("email", "").strip():
            continue
        try:
            contacts.append(
                _contact(row["email"], row["created_at"], row.get("unsubscribed", ""))
            )
        except ValueError as e:
            raise WaitlistSourceError(f"bad row for a contact: {e}") from e
    return contacts


@dataclass
class SyncResult:
    added: int = 0
    updated: int = 0
    removed: int = 0


async def replace_entries(
    db: AsyncSession, contacts: list[WaitlistContact]
) -> SyncResult:
    """Make ``waitlist_entries`` the given contact list: new contacts added,
    known ones updated (the earliest sign-up of an email kept), the rest
    removed. The caller commits."""
    wanted: dict[str, WaitlistContact] = {}
    for contact in contacts:
        email = contact.email.strip().lower()
        known = wanted.get(email)
        if known is None or contact.created_at < known.created_at:
            wanted[email] = contact.model_copy(update={"email": email})
    existing = {
        e.email: e for e in (await db.execute(select(WaitlistEntry))).scalars().all()
    }
    result = SyncResult()
    for email, contact in wanted.items():
        entry = existing.get(email)
        if entry is None:
            db.add(
                WaitlistEntry(
                    email=email,
                    contact_created_at=contact.created_at,
                    unsubscribed=contact.unsubscribed,
                )
            )
            result.added += 1
        else:
            entry.contact_created_at = contact.created_at
            entry.unsubscribed = contact.unsubscribed
            entry.synced_at = datetime.now(UTC)
            result.updated += 1
    gone = [email for email in existing if email not in wanted]
    if gone:
        await db.execute(delete(WaitlistEntry).where(WaitlistEntry.email.in_(gone)))
        result.removed = len(gone)
    await db.flush()
    return result
