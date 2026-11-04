"""Reading the waitlist: the Resend audience API, or a one-off CSV export
(V11-P5). Emails are stored trimmed and lowercased, unsubscribed contacts
included (decision #10)."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy import select

from app.models.database import WaitlistEntry
from app.services.waitlist_source import (
    ResendAudienceClient,
    WaitlistContact,
    WaitlistSourceError,
    parse_export_csv,
    replace_entries,
)


def _client(handler) -> ResendAudienceClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return ResendAudienceClient(
        api_key="re_test", audience_id="aud_1", http=http, page_delay=0
    )


async def test_lists_every_page_of_the_audience():
    seen: list[httpx.Request] = []
    pages = {
        None: {
            "object": "list",
            "has_more": True,
            "data": [
                {
                    "id": "c1",
                    "email": " First@Example.com",
                    "created_at": "2026-11-03 18:15:01.123+00",
                    "unsubscribed": False,
                }
            ],
        },
        "c1": {
            "object": "list",
            "has_more": False,
            "data": [
                {
                    "id": "c2",
                    "email": "second@example.com",
                    "created_at": "2026-11-04T09:00:00.000Z",
                    "unsubscribed": True,
                }
            ],
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=pages[request.url.params.get("after")])

    contacts = await _client(handler).list_contacts()

    assert contacts == [
        WaitlistContact(
            email="first@example.com",
            created_at=datetime(2026, 11, 3, 18, 15, 1, 123000, tzinfo=UTC),
            unsubscribed=False,
        ),
        WaitlistContact(
            email="second@example.com",
            created_at=datetime(2026, 11, 4, 9, 0, tzinfo=UTC),
            unsubscribed=True,
        ),
    ]
    assert seen[0].url.path == "/audiences/aud_1/contacts"
    assert seen[0].headers["authorization"] == "Bearer re_test"
    assert seen[0].url.params["limit"] == "100"


async def test_an_api_error_raises_and_lists_nothing():
    with pytest.raises(WaitlistSourceError):
        await _client(lambda r: httpx.Response(401, json={})).list_contacts()


def test_parses_a_resend_csv_export():
    text = (
        "id,email,first_name,last_name,created_at,unsubscribed\n"
        "c1, A@Example.com ,,,2026-11-03 18:15:01.123+00,false\n"
        "c2,b@example.com,,,2026-11-04T09:00:00Z,true\n"
        ",,,,,\n"
    )

    contacts = parse_export_csv(text)

    assert [(c.email, c.unsubscribed) for c in contacts] == [
        ("a@example.com", False),
        ("b@example.com", True),
    ]
    assert contacts[1].created_at == datetime(2026, 11, 4, 9, tzinfo=UTC)


def test_csv_without_the_needed_columns_is_refused():
    with pytest.raises(WaitlistSourceError):
        parse_export_csv("email\nA@example.com\n")


async def test_replace_entries_upserts_and_drops_deleted_contacts(db_session):
    old = datetime(2026, 10, 1, tzinfo=UTC)
    db_session.add_all(
        [
            WaitlistEntry(email="stays@example.com", contact_created_at=old),
            WaitlistEntry(email="deleted@example.com", contact_created_at=old),
        ]
    )
    await db_session.flush()
    contacts = [
        WaitlistContact(email="stays@example.com", created_at=old, unsubscribed=True),
        WaitlistContact(
            email="new@example.com",
            created_at=datetime(2026, 11, 1, tzinfo=UTC),
            unsubscribed=False,
        ),
        # The same email twice keeps the earliest sign-up.
        WaitlistContact(
            email="new@example.com",
            created_at=datetime(2026, 10, 15, tzinfo=UTC),
            unsubscribed=False,
        ),
    ]

    result = await replace_entries(db_session, contacts)

    rows = {
        e.email: e
        for e in (await db_session.execute(select(WaitlistEntry))).scalars().all()
    }
    assert set(rows) == {"stays@example.com", "new@example.com"}
    # A contact who asked to be deleted gives up the offer (decision #10).
    assert "deleted@example.com" not in rows
    assert rows["stays@example.com"].unsubscribed is True
    assert rows["new@example.com"].contact_created_at.replace(tzinfo=UTC) == (
        datetime(2026, 10, 15, tzinfo=UTC)
    )
    assert (result.added, result.updated, result.removed) == (1, 1, 1)
