"""Categories: the eight defaults plus a user's custom ones (BC-05 AC 3, V11-P1).

A custom category belongs to one user (``categories.user_id``; the data model
gives Category no household). A user has at most ``MAX_CUSTOM_CATEGORIES``.
Creating and renaming one is Premium (D2), checked by the route. Once Premium
lapses the categories stay: they list, take corrections and budgets, and can be
deleted, so nothing the user filed disappears.

Deleting a custom category keeps the spending it held:

- its line items move to the default "Other" category (the catch-all, as the
  rule-based assigner uses it), so overall spend and history are unchanged;
- item mappings that pointed at it lose their category, so the next scan of
  those items is assigned afresh instead of landing in "Other" for good;
- its budgets (active or in Recently Deleted) are removed with their sent
  alerts: a budget for a category that no longer exists measures nothing;
- it leaves the user's muted alert categories.

Concurrency: one lock on the user's row (``_lock_user``) serializes a user's
create, rename and delete, and every write that attaches a custom category to
a row (a correction, a budget, a manual receipt, a scan applying an item
mapping) takes it first through ``ensure_usable`` or ``usable_custom``. So a
create cannot pass the cap or the name check beside another, and a delete
never removes a category under a row about to point at it: the attach either
commits first and is moved by the delete, or waits and finds the category
gone (a clean 400, or no category for a scan).
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import (
    Budget,
    BudgetAlertSent,
    Category,
    LineItem,
    User,
    UserItemMapping,
)

MAX_CUSTOM_CATEGORIES = 10
# Custom categories sort after the defaults (1-8), in the order they were made.
CUSTOM_SORT_START = 100
FALLBACK_CATEGORY_NAME = "Other"


class CategoryNotFoundError(Exception):
    """No custom category with that id belongs to the user."""


class CategoryLimitError(Exception):
    """The user already has ``MAX_CUSTOM_CATEGORIES`` custom categories."""


class CategoryNameTakenError(Exception):
    """A default or one of the user's own categories already has that name."""


class UnknownCategoryError(ValueError):
    """A category id that is neither a default nor the user's own.

    A ValueError, so routes that answer ValueError with 400 refuse it.
    """

    def __init__(self, category_id: uuid.UUID) -> None:
        super().__init__(f"Unknown category {category_id}")
        self.category_id = category_id


def visible_to(user_id: uuid.UUID):
    """Where-clause: the categories ``user_id`` can see and use."""
    return (Category.is_default.is_(True)) | (Category.user_id == user_id)


class CategoryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_for_user(self, user_id: uuid.UUID) -> list[Category]:
        result = await self.db.execute(
            select(Category)
            .where(visible_to(user_id))
            .order_by(Category.sort_order, Category.name)
        )
        return list(result.scalars().all())

    async def ensure_usable(
        self, user_id: uuid.UUID, category_ids: Iterable[uuid.UUID | None]
    ) -> None:
        """Raise ``UnknownCategoryError`` unless every id is visible to the user.

        Call it before writing the ids: a custom one stays until this
        transaction commits (see ``usable_custom``).
        """
        wanted = {c for c in category_ids if c is not None}
        if not wanted:
            return
        custom = wanted - await self._defaults_among(wanted)
        missing = custom - await self.usable_custom(user_id, custom)
        if missing:
            raise UnknownCategoryError(sorted(missing, key=str)[0])

    async def usable_custom(
        self, user_id: uuid.UUID, category_ids: Iterable[uuid.UUID]
    ) -> set[uuid.UUID]:
        """Those of ``category_ids`` that are the user's custom categories.

        Takes the user lock first when there are any, so none of them can be
        deleted before this transaction commits. Read after the lock, so one
        a delete just removed is left out.
        """
        wanted = set(category_ids)
        if not wanted:
            return set()
        await self._lock_user(user_id)
        result = await self.db.execute(
            select(Category.id).where(
                Category.id.in_(wanted),
                Category.user_id == user_id,
                Category.is_default.is_(False),
            )
        )
        return set(result.scalars().all())

    async def create(self, user_id: uuid.UUID, name: str) -> Category:
        await self._lock_user(user_id)
        custom = await self._custom(user_id)
        if len(custom) >= MAX_CUSTOM_CATEGORIES:
            raise CategoryLimitError
        await self._ensure_name_free(user_id, name)
        category = Category(
            name=name,
            user_id=user_id,
            is_default=False,
            sort_order=max([CUSTOM_SORT_START, *(c.sort_order or 0 for c in custom)])
            + 1,
        )
        self.db.add(category)
        await self.db.flush()
        return category

    async def rename(
        self, user_id: uuid.UUID, category_id: uuid.UUID, name: str
    ) -> Category:
        await self._lock_user(user_id)
        category = await self._owned(user_id, category_id)
        await self._ensure_name_free(user_id, name, exclude=category.id)
        category.name = name
        await self.db.flush()
        return category

    async def delete(self, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
        # Waits for any request attaching this category to commit, so its
        # rows are visible to (and moved by) the updates below.
        await self._lock_user(user_id)
        category = await self._owned(user_id, category_id)
        fallback = (
            await self.db.execute(
                select(Category.id).where(
                    Category.is_default.is_(True),
                    Category.name == FALLBACK_CATEGORY_NAME,
                )
            )
        ).scalar_one_or_none()

        budgets = select(Budget.id).where(Budget.category_id == category.id)
        statements = [
            update(LineItem)
            .where(LineItem.category_id == category.id)
            .values(category_id=fallback),
            update(UserItemMapping)
            .where(UserItemMapping.category_id == category.id)
            .values(category_id=None),
            # Children first: SQLite tests don't enforce ON DELETE CASCADE.
            delete(BudgetAlertSent).where(BudgetAlertSent.budget_id.in_(budgets)),
            delete(Budget).where(Budget.category_id == category.id),
        ]
        # Default synchronization keeps rows already loaded in this session
        # in step with the bulk changes.
        for statement in statements:
            await self.db.execute(statement)

        user = await self.db.get(User, user_id)
        prefs = dict(user.preferences or {}) if user is not None else {}
        muted = prefs.get("muted_alert_categories")
        if user is not None and muted and str(category.id) in muted:
            prefs["muted_alert_categories"] = [
                m for m in muted if m != str(category.id)
            ]
            user.preferences = prefs

        await self.db.delete(category)
        await self.db.flush()

    async def custom_count(self, user_id: uuid.UUID) -> int:
        """How many custom categories the user has."""
        return len(await self._custom(user_id))

    async def _lock_user(self, user_id: uuid.UUID) -> None:
        """Lock the user's row until this transaction ends (see the module
        docstring). SQLite ignores the lock.

        FOR NO KEY UPDATE, not FOR UPDATE: it does not block the key-share
        lock that inserting any row which references the user takes. A
        receipt confirm holds its budget locks and then inserts a
        notification; with FOR UPDATE, a delete holding this lock and waiting
        for those budgets would deadlock with it.
        """
        await self.db.execute(
            select(User.id).where(User.id == user_id).with_for_update(key_share=True)
        )

    async def _defaults_among(self, ids: set[uuid.UUID]) -> set[uuid.UUID]:
        result = await self.db.execute(
            select(Category.id).where(
                Category.id.in_(ids), Category.is_default.is_(True)
            )
        )
        return set(result.scalars().all())

    async def _custom(self, user_id: uuid.UUID) -> list[Category]:
        result = await self.db.execute(
            select(Category).where(
                Category.user_id == user_id, Category.is_default.is_(False)
            )
        )
        return list(result.scalars().all())

    async def _owned(self, user_id: uuid.UUID, category_id: uuid.UUID) -> Category:
        result = await self.db.execute(
            select(Category).where(
                Category.id == category_id,
                Category.user_id == user_id,
                Category.is_default.is_(False),
            )
        )
        category = result.scalar_one_or_none()
        if category is None:
            raise CategoryNotFoundError
        return category

    async def _ensure_name_free(
        self, user_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None
    ) -> None:
        query = select(Category.id).where(
            visible_to(user_id), func.lower(Category.name) == name.lower()
        )
        if exclude is not None:
            query = query.where(Category.id != exclude)
        if (await self.db.execute(query)).first() is not None:
            raise CategoryNameTakenError
