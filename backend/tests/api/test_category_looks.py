"""Category colour and icon (BC-05 AC 5, 7, 8; DA-9).

Every category has a colour and an icon. The built-ins have fixed ones; a
custom category takes them from the allowed sets in
``app.models.category_looks`` (the first of each when none is chosen). The
server refuses any other value with 422. Changing them is Premium, like a
rename; after a lapse the category keeps them.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.seed import seed_default_categories
from app.models.category_looks import (
    CUSTOM_COLORS,
    CUSTOM_ICONS,
    DEFAULT_COLOR,
    DEFAULT_ICON,
    DEFAULT_LOOKS,
)
from app.models.database import Category, User
from tests.conftest import DEV_USER_ID, USER_B_ID


@pytest.fixture
async def seeded(db_session: AsyncSession):
    await seed_default_categories(db_session)
    await db_session.flush()


async def _make_premium(db_session: AsyncSession, user_id) -> User:
    user = await db_session.get(User, user_id)
    assert user is not None
    user.premium_active = True
    user.premium_expires_at = None
    await db_session.flush()
    return user


@pytest.fixture
async def premium(client: AsyncClient, db_session: AsyncSession) -> User:
    return await _make_premium(db_session, DEV_USER_ID)


@pytest.fixture
def analytics_spy(client):
    from app.services.analytics_service import AnalyticsService, get_analytics_service
    from main import app
    from tests.api.test_analytics import SpyBackend

    spy = SpyBackend()
    app.dependency_overrides[get_analytics_service] = lambda: AnalyticsService(
        backend=spy
    )
    return spy


async def _by_name(client: AsyncClient) -> dict[str, dict]:
    resp = await client.get("/api/categories")
    assert resp.status_code == 200
    return {c["name"]: c for c in resp.json()}


# --- AC 5: every category has a colour and an icon ---


async def test_built_in_categories_have_their_fixed_colour_and_icon(
    client: AsyncClient, seeded
):
    cats = await _by_name(client)
    assert len(cats) == 8
    for name, (color, icon) in DEFAULT_LOOKS.items():
        assert (cats[name]["color"], cats[name]["icon"]) == (color, icon)


async def test_a_new_category_without_a_choice_gets_the_first_colour_and_icon(
    client: AsyncClient, seeded, premium
):
    resp = await client.post("/api/categories", json={"name": "Garden"})
    assert resp.status_code == 201
    body = resp.json()
    assert (body["color"], body["icon"]) == (DEFAULT_COLOR, DEFAULT_ICON)
    assert CUSTOM_COLORS[0] == DEFAULT_COLOR
    assert CUSTOM_ICONS[0] == DEFAULT_ICON


async def test_a_new_category_keeps_the_colour_and_icon_chosen(
    client: AsyncClient, seeded, premium
):
    resp = await client.post(
        "/api/categories", json={"name": "Garden", "color": "mint", "icon": "leaf"}
    )
    assert resp.status_code == 201
    assert (resp.json()["color"], resp.json()["icon"]) == ("mint", "leaf")
    garden = (await _by_name(client))["Garden"]
    assert (garden["color"], garden["icon"]) == ("mint", "leaf")


@pytest.mark.parametrize(
    "look",
    [
        {"color": "#ff0000"},
        {"color": "gray"},  # a built-in's colour, not in the custom palette
        {"color": "MINT"},
        {"color": ""},
        {"icon": "cart"},  # a built-in's icon
        {"icon": "trash.fill"},
        {"icon": "<script>"},
        {"color": None},
        {"icon": 3},
    ],
)
async def test_colour_and_icon_outside_the_allowed_sets_are_refused(
    client: AsyncClient, seeded, premium, look
):
    created = await client.post("/api/categories", json={"name": "Garden", **look})
    assert created.status_code == 422
    assert "Garden" not in await _by_name(client)

    cid = (await client.post("/api/categories", json={"name": "Yard"})).json()["id"]
    patched = await client.patch(f"/api/categories/{cid}", json=look)
    assert patched.status_code == 422
    yard = (await _by_name(client))["Yard"]
    assert (yard["color"], yard["icon"]) == (DEFAULT_COLOR, DEFAULT_ICON)


async def test_patch_changes_colour_and_icon_and_keeps_the_name(
    client: AsyncClient, seeded, premium
):
    cid = (await client.post("/api/categories", json={"name": "Garden"})).json()["id"]
    resp = await client.patch(
        f"/api/categories/{cid}", json={"color": "green", "icon": "leaf"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Garden"
    assert (resp.json()["color"], resp.json()["icon"]) == ("green", "leaf")

    # One field at a time leaves the other alone.
    resp = await client.patch(f"/api/categories/{cid}", json={"icon": "gift"})
    assert (resp.json()["color"], resp.json()["icon"]) == ("green", "gift")
    resp = await client.patch(f"/api/categories/{cid}", json={"name": "Yard"})
    assert resp.json()["name"] == "Yard"
    assert (resp.json()["color"], resp.json()["icon"]) == ("green", "gift")


async def test_patch_with_nothing_to_change_is_refused(
    client: AsyncClient, seeded, premium
):
    cid = (await client.post("/api/categories", json={"name": "Garden"})).json()["id"]
    assert (await client.patch(f"/api/categories/{cid}", json={})).status_code == 422


async def test_built_in_colours_cannot_be_changed(client: AsyncClient, seeded, premium):
    groceries = (await _by_name(client))["Groceries"]
    resp = await client.patch(
        f"/api/categories/{groceries['id']}", json={"color": "red"}
    )
    assert resp.status_code == 404
    assert (await _by_name(client))["Groceries"]["color"] == "green"


async def test_a_look_only_change_is_not_counted_as_a_rename(
    client: AsyncClient, seeded, premium, analytics_spy
):
    cid = (await client.post("/api/categories", json={"name": "Garden"})).json()["id"]
    await client.patch(f"/api/categories/{cid}", json={"color": "red"})
    changed = [c[1] for c in analytics_spy.calls if c[0] == "custom_category_changed"]
    assert changed == [{"action": "created", "custom_count": 1}]


# --- Two users: looks are the owner's own ---


async def test_another_users_category_colour_cannot_be_changed_or_seen(
    client: AsyncClient, seeded, premium, db_session: AsyncSession
):
    """User A (``client``) and user B, both Premium, with a "Garden" each."""
    db_session.add(User(id=USER_B_ID, email="userb@test.com", name="User B"))
    await db_session.flush()
    await _make_premium(db_session, USER_B_ID)
    theirs = Category(
        name="Garden", user_id=USER_B_ID, sort_order=101, color="blue", icon="book"
    )
    db_session.add(theirs)
    await db_session.flush()

    # A may use the same name and look for their own.
    mine = await client.post(
        "/api/categories", json={"name": "Garden", "color": "blue", "icon": "book"}
    )
    assert mine.status_code == 201
    assert mine.json()["id"] != str(theirs.id)

    # A cannot restyle B's, and never sees it.
    resp = await client.patch(f"/api/categories/{theirs.id}", json={"color": "red"})
    assert resp.status_code == 404
    await db_session.refresh(theirs)
    assert (theirs.color, theirs.icon) == ("blue", "book")
    ids = [c["id"] for c in (await client.get("/api/categories")).json()]
    assert str(theirs.id) not in ids

    # A's own change leaves B's alone.
    await client.patch(f"/api/categories/{mine.json()['id']}", json={"color": "mint"})
    await db_session.refresh(theirs)
    assert theirs.color == "blue"


# --- AC 8: after a lapse the looks stay; changing them needs Premium ---


async def test_after_a_lapse_the_look_stays_and_changing_it_needs_premium(
    client: AsyncClient, seeded, premium: User, db_session: AsyncSession
):
    cid = (
        await client.post(
            "/api/categories", json={"name": "Garden", "color": "mint", "icon": "leaf"}
        )
    ).json()["id"]
    premium.premium_active = False
    await db_session.flush()

    garden = (await _by_name(client))["Garden"]
    assert (garden["color"], garden["icon"]) == ("mint", "leaf")

    resp = await client.patch(f"/api/categories/{cid}", json={"color": "red"})
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "premium_required"
    assert resp.json()["detail"]["feature"] == "custom_categories"
    garden = (await _by_name(client))["Garden"]
    assert (garden["color"], garden["icon"]) == ("mint", "leaf")


async def test_a_category_made_before_colours_reads_the_defaults(
    client: AsyncClient, seeded, db_session: AsyncSession
):
    """11-edge-cases.md Premium 5: a row with no stored look (as the migration
    backfills it) reads the first colour and the default icon."""
    db_session.add(Category(name="Legacy", user_id=DEV_USER_ID, sort_order=101))
    await db_session.flush()
    legacy = (await _by_name(client))["Legacy"]
    assert (legacy["color"], legacy["icon"]) == (DEFAULT_COLOR, DEFAULT_ICON)


# --- AC 7: the dashboard's category bars carry the look ---


async def test_dashboard_category_bars_carry_colour_and_icon(
    client: AsyncClient, seeded, premium
):
    cid = (
        await client.post(
            "/api/categories", json={"name": "Garden", "color": "mint", "icon": "leaf"}
        )
    ).json()["id"]
    groceries = (await _by_name(client))["Groceries"]["id"]
    for category_id in (cid, groceries):
        resp = await client.post(
            "/api/budgets",
            json={
                "category_id": category_id,
                "amount": 50,
                "period_start": "2026-03-01",
            },
        )
        assert resp.status_code == 201

    summary = await client.get("/api/budgets/summary", params={"period": "2026-03"})
    assert summary.status_code == 200
    bars = {c["name"]: c for c in summary.json()["categories"]}
    assert (bars["Garden"]["color"], bars["Garden"]["icon"]) == ("mint", "leaf")
    assert (bars["Groceries"]["color"], bars["Groceries"]["icon"]) == ("green", "cart")

    dashboard = await client.get(
        "/api/dashboard/spending", params={"period": "2026-03"}
    )
    assert dashboard.status_code == 200
    bars = {c["name"]: c for c in dashboard.json()["categories"]}
    assert (bars["Garden"]["color"], bars["Garden"]["icon"]) == ("mint", "leaf")


async def test_a_category_with_spend_but_no_budget_carries_its_look(
    client: AsyncClient, seeded, premium
):
    """A bar for spend with no budget behind it is drawn in the category's
    own colour and icon too, not the default ones."""
    cid = (
        await client.post(
            "/api/categories", json={"name": "Garden", "color": "mint", "icon": "leaf"}
        )
    ).json()["id"]
    groceries = (await _by_name(client))["Groceries"]["id"]
    resp = await client.post(
        "/api/receipts",
        json={
            "store_name": "Market",
            "date": "2026-03-10",
            "total": 5.0,
            "items": [
                {
                    "name": "Seeds",
                    "unit_price": 3.0,
                    "total_price": 3.0,
                    "category_id": cid,
                },
                {
                    "name": "Bread",
                    "unit_price": 2.0,
                    "total_price": 2.0,
                    "category_id": groceries,
                },
            ],
        },
    )
    assert resp.status_code == 201

    for path in ("/api/budgets/summary", "/api/dashboard/spending"):
        body = (await client.get(path, params={"period": "2026-03"})).json()
        bars = {c["name"]: c for c in body["categories"]}
        assert bars["Garden"]["budget"] == 0.0
        assert bars["Garden"]["spent"] == 3.0
        assert (bars["Garden"]["color"], bars["Garden"]["icon"]) == ("mint", "leaf")
        assert (bars["Groceries"]["color"], bars["Groceries"]["icon"]) == (
            "green",
            "cart",
        )
