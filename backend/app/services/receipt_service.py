from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.retention import restore_cutoff
from app.events.dispatcher import dispatcher
from app.events.types import ItemCorrected, ReceiptConfirmed
from app.llm.provider import (
    CategoryAssigner,
    ReceiptExtractor,
    RuleBasedCategoryAssigner,
)
from app.models.database import (
    Category,
    LineItem,
    Receipt,
    ReceiptCorrection,
    Store,
    UserItemMapping,
)
from app.models.schemas import (
    LineItemExtraction,
    ReceiptExtraction,
    ReceiptScanResponse,
    ReceiptUpdateRequest,
)
from app.services.budget_service import BudgetService
from app.services.notification_service import NotificationService
from app.services.store_service import StoreService

if TYPE_CHECKING:
    from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)


class ReceiptAlreadyConfirmedError(Exception):
    """A confirmed receipt cannot move to another status."""

    def __init__(self, receipt_id: uuid.UUID) -> None:
        super().__init__(f"Receipt {receipt_id} is confirmed and cannot change status")


def _format_quantity(quantity: Decimal) -> str:
    """Write a quantity without the column's trailing zeros: 1.000 -> "1"."""
    return format(quantity.normalize(), "f")


class ReceiptService:
    def __init__(
        self,
        db: AsyncSession,
        extractor: ReceiptExtractor | None = None,
        category_assigner: CategoryAssigner | None = None,
        analytics: AnalyticsService | None = None,
    ) -> None:
        self.db = db
        self.extractor = extractor
        self.category_assigner = category_assigner
        self.analytics = analytics
        self.store_service = StoreService(db)

    async def count_receipts_in_month(
        self, user_id: uuid.UUID, reference: datetime
    ) -> int:
        """Count this user's receipts scanned in the calendar month of `reference`."""
        month_start = datetime(reference.year, reference.month, 1, tzinfo=UTC)
        if reference.month == 12:
            next_month = datetime(reference.year + 1, 1, 1, tzinfo=UTC)
        else:
            next_month = datetime(reference.year, reference.month + 1, 1, tzinfo=UTC)

        result = await self.db.execute(
            select(func.count(Receipt.id)).where(
                Receipt.user_id == user_id,
                Receipt.created_at >= month_start,
                Receipt.created_at < next_month,
            )
        )
        return int(result.scalar() or 0)

    async def process_receipt(
        self,
        user_id: uuid.UUID,
        image_data: bytes,
        content_type: str,
    ) -> ReceiptScanResponse:
        """Extract receipt data and persist to database."""
        assert self.extractor is not None, "Extractor required for processing"
        start_time = time.monotonic()
        extraction = await self.extractor.extract(image_data, content_type)
        duration_ms = int((time.monotonic() - start_time) * 1000)
        if self.analytics:
            self.analytics.emit(
                "receipt_extraction_completed",
                {
                    "duration_ms": duration_ms,
                    "item_count": len(extraction.items),
                    "confidence_avg": round(extraction.confidence, 2),
                },
                user_id,
            )

        # Look up or create store
        store = await self.store_service.find_or_create(extraction.store_name)

        # Parse date — the LLM is asked for ISO YYYY-MM-DD but compliance isn't
        # guaranteed (esp. non-US receipts). Never 500 on a bad date; fall back
        # to today and flag for review.
        try:
            receipt_date = date.fromisoformat(extraction.date)
        except ValueError:
            logger.warning(
                "Non-ISO date from extractor (%r); defaulting to today",
                extraction.date,
            )
            receipt_date = date.today()

        # Check for duplicate receipt before persisting
        is_duplicate = await self._check_duplicate(
            user_id,
            store.id,
            receipt_date,
            extraction.total,
            len(extraction.items),
        )

        # Load user's item mappings for category overrides
        mappings = await self._get_user_mappings(user_id)

        # Load default categories for name-to-id resolution
        categories = await self._get_categories(user_id)
        category_lookup = {cat.name: cat.id for cat in categories}

        # Create receipt
        receipt = Receipt(
            user_id=user_id,
            store_id=store.id,
            date=receipt_date,
            subtotal=extraction.subtotal,
            tax=extraction.tax,
            total=extraction.total,
            currency=extraction.currency,
            extraction_confidence=extraction.confidence,
            store_name_confidence=extraction.store_name_confidence,
            date_confidence=extraction.date_confidence,
            total_confidence=extraction.total_confidence,
            status="pending_review",
        )
        self.db.add(receipt)
        await self.db.flush()

        # Create line items
        item_responses: list[LineItemExtraction] = []
        for extracted_item in extraction.items:
            # Check user mappings for category override
            category_id = None
            category_confidence = None

            mapping = mappings.get(extracted_item.name.strip().lower())
            if mapping and mapping.category_id:
                category_id = mapping.category_id
                category_confidence = 1.0  # Deterministic override
            elif extracted_item.category and extracted_item.category in category_lookup:
                category_id = category_lookup[extracted_item.category]
                category_confidence = extracted_item.confidence * 0.9

            line_item = LineItem(
                receipt_id=receipt.id,
                raw_name=extracted_item.name,
                quantity=extracted_item.quantity,
                unit_price=extracted_item.unit_price,
                total_price=extracted_item.total_price,
                unit_of_measure=extracted_item.unit_of_measure,
                category_id=category_id,
                category_confidence=category_confidence,
                extraction_confidence=extracted_item.confidence,
            )
            self.db.add(line_item)
            await self.db.flush()

            item_responses.append(
                LineItemExtraction(
                    id=line_item.id,
                    name=extracted_item.name,
                    quantity=extracted_item.quantity,
                    unit_price=extracted_item.unit_price,
                    total_price=extracted_item.total_price,
                    category_id=category_id,
                    category_confidence=category_confidence,
                    extraction_confidence=extracted_item.confidence,
                )
            )

        # Post-extraction: assign categories to uncategorized items via LLM
        uncategorized_items = [
            (li, resp)
            for li, resp in zip(
                (
                    await self.db.execute(
                        select(LineItem).where(LineItem.receipt_id == receipt.id)
                    )
                )
                .scalars()
                .all(),
                item_responses,
                strict=False,
            )
            if li.category_id is None
        ]

        if uncategorized_items and self.category_assigner:
            names = [li.raw_name for li, _ in uncategorized_items]
            try:
                assignments = await self.category_assigner.assign(names)
            except Exception:
                # CLAUDE.md mandates a rule-based fallback when the LLM is
                # unavailable or returns invalid output. Log it (was silently
                # swallowed before), emit a metric, then degrade gracefully.
                logger.exception(
                    "Category assignment failed for receipt %s; "
                    "falling back to rule-based assignment",
                    receipt.id,
                )
                if self.analytics:
                    self.analytics.emit(
                        "category_assignment_failed",
                        {"item_count": len(names)},
                        user_id,
                    )
                try:
                    assignments = await RuleBasedCategoryAssigner().assign(names)
                except Exception:
                    logger.exception(
                        "Rule-based category fallback failed for receipt %s",
                        receipt.id,
                    )
                    assignments = []

            assignment_map = {a["name"]: a for a in assignments}
            for li, resp in uncategorized_items:
                assignment = assignment_map.get(li.raw_name)
                if assignment and assignment.get("category"):
                    cat_id = category_lookup.get(assignment["category"])
                    if cat_id:
                        li.category_id = cat_id
                        li.category_confidence = assignment.get("confidence", 0.7)
                        resp.category_id = cat_id
                        resp.category_confidence = li.category_confidence

        return ReceiptScanResponse(
            receipt_id=receipt.id,
            status=receipt.status,
            extraction=ReceiptExtraction(
                store_name=extraction.store_name,
                # The stored date, not the raw string: an unreadable one was
                # replaced with today, and review edits start from this value.
                date=receipt.date.isoformat(),
                items=item_responses,
                subtotal=extraction.subtotal,
                tax=extraction.tax,
                total=extraction.total,
                currency=extraction.currency,
                confidence=extraction.confidence,
                store_name_confidence=extraction.store_name_confidence,
                date_confidence=extraction.date_confidence,
                total_confidence=extraction.total_confidence,
            ),
            duplicate_warning=is_duplicate,
        )

    async def get_receipt(self, receipt_id: uuid.UUID, user_id: uuid.UUID) -> Receipt:
        """Get a single receipt with line items and store."""
        return await self._get_receipt(receipt_id, user_id)

    async def confirm_receipt(self, receipt_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Confirm a receipt, dispatch ReceiptConfirmed, and check budget thresholds."""
        receipt = await self._get_receipt(receipt_id, user_id)
        await self._confirm(receipt)

    async def _confirm(
        self, receipt: Receipt, also_changed: Iterable[date] = ()
    ) -> None:
        """Confirm ``receipt``. ``also_changed`` holds the dates of other
        receipts whose spend this request changed; their periods alert too."""
        user_id = receipt.user_id
        receipt.status = "confirmed"
        await self.db.flush()

        correction_count = sum(1 for li in receipt.line_items if li.corrected)
        if self.analytics:
            self.analytics.emit(
                "receipt_confirmed",
                {
                    "item_count": len(receipt.line_items),
                    "total_amount": float(receipt.total) if receipt.total else 0,
                    "correction_count": correction_count,
                },
                user_id,
            )

        await self._after_confirm(receipt, also_changed)

    async def _after_confirm(
        self, receipt: Receipt, also_changed: Iterable[date] = ()
    ) -> None:
        """Dispatch ReceiptConfirmed and alert on budget thresholds now crossed.

        Every receipt that becomes confirmed runs this: a scan the user confirms
        and a manual entry, which is saved as confirmed.
        """
        dispatcher.dispatch(
            ReceiptConfirmed(
                receipt_id=receipt.id,
                user_id=receipt.user_id,
                household_id=receipt.household_id,
                store_id=receipt.store_id,
                date=receipt.date,
                line_items=[
                    {
                        "id": str(li.id),
                        "name": li.raw_name,
                        "total_price": float(li.total_price),
                        "category_id": (
                            str(li.category_id) if li.category_id else None
                        ),
                    }
                    for li in receipt.line_items
                ],
            )
        )

        await self._alert_on_thresholds(receipt.user_id, {receipt.date, *also_changed})

    async def _alert_on_thresholds(self, user_id: uuid.UUID, dates: set[date]) -> None:
        """Notify for each budget threshold crossed in the periods holding ``dates``.

        claim_alert lets each threshold alert once per period, so running this
        again (after an edit) never repeats an alert. Call it once per request
        with every changed date: each call locks the user's budget rows, and a
        second lock pass could deadlock with a concurrent confirm.
        """
        if not dates:
            return
        budget_service = BudgetService(self.db)
        notification_service = NotificationService(self.db)
        breaches = await budget_service.check_thresholds(user_id, *sorted(dates))
        for breach in breaches:
            if not await budget_service.claim_alert(breach):
                continue  # already alerted for this threshold this period
            if breach.threshold_percent >= 100:
                overage = breach.current_spend - breach.budget_amount
                title = "Budget Exceeded"
                body = f"You've exceeded your budget by ${overage:.2f}."
            else:
                title = f"Budget {breach.threshold_percent}% Reached"
                body = (
                    f"${breach.remaining_amount:.2f} remaining with "
                    f"{breach.days_left_in_period} days left in this period."
                )
            await notification_service.create_notification(
                user_id=user_id,
                type="budget_threshold",
                title=title,
                body=body,
                data={
                    "budget_id": str(breach.budget_id),
                    "threshold": breach.threshold_percent,
                },
            )
            if self.analytics:
                self.analytics.emit(
                    "budget_alert_triggered",
                    {
                        "threshold_percent": breach.threshold_percent,
                        "category": str(breach.budget_id),
                    },
                    user_id,
                )
            dispatcher.dispatch(breach)

    async def update_receipt(
        self,
        receipt_id: uuid.UUID,
        user_id: uuid.UUID,
        updates: ReceiptUpdateRequest,
    ) -> Receipt:
        """Apply corrections to a receipt."""
        receipt = await self._get_receipt(receipt_id, user_id)
        already_confirmed = receipt.status == "confirmed"
        if already_confirmed and updates.status not in (None, "confirmed"):
            # Moving it back and confirming again would dispatch
            # ReceiptConfirmed a second time.
            raise ReceiptAlreadyConfirmedError(receipt_id)
        # Dates of other confirmed receipts whose spend a category correction
        # moved. Their periods can cross a threshold too.
        other_changed: set[date] = set()

        current_store_name = receipt.store.name if receipt.store else None
        if (
            updates.store_name is not None
            and updates.store_name.strip() != current_store_name
        ):
            self._record_correction(
                receipt,
                user_id,
                "store_name",
                current_store_name or "",
                updates.store_name.strip(),
            )
            receipt.store = await self.store_service.find_or_create(updates.store_name)

        if updates.date is not None and updates.date != receipt.date:
            self._record_correction(
                receipt,
                user_id,
                "date",
                receipt.date.isoformat(),
                updates.date.isoformat(),
            )
            receipt.date = updates.date

        if updates.items:
            line_items_by_id = {li.id: li for li in receipt.line_items}
            # Subtotal and total are not edited; they move by what price
            # corrections changed, which keeps any unitemised discount.
            price_delta = Decimal("0")

            for correction in updates.items:
                line_item = line_items_by_id.get(correction.id)
                if line_item is None:
                    continue
                # Key mappings on the name as extracted: the next scan of this
                # item produces that name, not the user's corrected one.
                extracted_name = line_item.raw_name

                if (
                    correction.name is not None
                    and correction.name != line_item.raw_name
                ):
                    self._record_correction(
                        receipt,
                        user_id,
                        "name",
                        line_item.raw_name,
                        correction.name,
                        line_item,
                    )
                    line_item.raw_name = correction.name
                    line_item.corrected = True

                # Quantity and price columns are Numeric; compare and divide
                # as Decimal. The line total is what was paid, so a quantity
                # edit keeps total_price and recomputes unit_price.
                new_quantity = (
                    Decimal(str(correction.quantity)).quantize(Decimal("0.001"))
                    if correction.quantity is not None
                    else None
                )
                old_quantity = Decimal(str(line_item.quantity or 0))
                quantity_changed = (
                    new_quantity is not None and new_quantity != old_quantity
                )
                if quantity_changed:
                    self._record_correction(
                        receipt,
                        user_id,
                        "quantity",
                        _format_quantity(old_quantity),
                        _format_quantity(new_quantity),
                        line_item,
                    )
                    line_item.quantity = new_quantity
                    line_item.corrected = True

                new_price = (
                    Decimal(str(correction.total_price)).quantize(Decimal("0.01"))
                    if correction.total_price is not None
                    else None
                )
                price_changed = new_price is not None and new_price != Decimal(
                    str(line_item.total_price)
                )
                if price_changed:
                    self._record_correction(
                        receipt,
                        user_id,
                        "total_price",
                        str(line_item.total_price),
                        str(new_price),
                        line_item,
                    )
                    price_delta += new_price - Decimal(str(line_item.total_price))
                    line_item.total_price = new_price
                    line_item.corrected = True

                if quantity_changed or price_changed:
                    quantity = Decimal(str(line_item.quantity or 0))
                    if quantity > 0:
                        line_item.unit_price = (
                            Decimal(str(line_item.total_price)) / quantity
                        ).quantize(Decimal("0.01"))

                if (
                    correction.category_id is not None
                    and correction.category_id != line_item.category_id
                ):
                    self._record_correction(
                        receipt,
                        user_id,
                        "category_id",
                        str(line_item.category_id) if line_item.category_id else "",
                        str(correction.category_id),
                        line_item,
                    )
                    line_item.category_id = correction.category_id
                    line_item.category_confidence = 1.0
                    line_item.corrected = True

                    # Update user item mapping for future scans
                    await self._update_item_mapping(
                        user_id, extracted_name, correction.category_id
                    )

                    # Retroactive update: apply to all historical instances
                    other_changed |= await self._retroactive_category_update(
                        user_id, extracted_name, correction.category_id
                    )

            if price_delta:
                if receipt.subtotal is not None:
                    receipt.subtotal = Decimal(str(receipt.subtotal)) + price_delta
                if receipt.total is not None:
                    receipt.total = Decimal(str(receipt.total)) + price_delta

        if updates.status == "confirmed" and not already_confirmed:
            await self._confirm(receipt, other_changed)
        else:
            if updates.status:
                receipt.status = updates.status
            # An edit changes spend without confirming again, so
            # ReceiptConfirmed is not dispatched; thresholds the edit crosses
            # still alert. A receipt under review adds no spend of its own.
            changed = set(other_changed)
            if already_confirmed and (updates.items or updates.date):
                changed.add(receipt.date)
            await self.db.flush()
            await self._alert_on_thresholds(user_id, changed)

        await self.db.flush()
        return receipt

    def _record_correction(
        self,
        receipt: Receipt,
        user_id: uuid.UUID,
        field: str,
        original_value: str,
        corrected_value: str,
        line_item: LineItem | None = None,
    ) -> None:
        """Log one changed field before it is overwritten (RC-02 AC 3).

        The row keeps the value being replaced; across repeated edits the
        oldest row for a field holds the value as extracted. Callers record
        only real changes, so a retried save adds no rows.
        """
        self.db.add(
            ReceiptCorrection(
                receipt_id=receipt.id,
                line_item_id=line_item.id if line_item else None,
                user_id=user_id,
                household_id=receipt.household_id,
                field=field,
                original_value=original_value,
                corrected_value=corrected_value,
            )
        )
        if line_item is not None:
            dispatcher.dispatch(
                ItemCorrected(
                    line_item_id=line_item.id,
                    field=field,
                    old_value=original_value,
                    new_value=corrected_value,
                    user_id=user_id,
                )
            )
        if self.analytics:
            self.analytics.emit(
                "receipt_correction_made",
                {
                    "field": field,
                    "original_value": original_value,
                    "corrected_value": corrected_value,
                },
                user_id,
            )

    async def list_receipts(
        self,
        user_id: uuid.UUID,
        page: int = 1,
        per_page: int = 20,
        store: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> tuple[list[Receipt], int]:
        """List receipts with pagination and optional filters."""
        # Accumulate WHERE conditions once and apply them to both the page
        # query and the count query, so every filter composes correctly and
        # the total always matches the filtered result set.
        conditions = [
            Receipt.user_id == user_id,
            Receipt.deleted_at.is_(None),
        ]
        if from_date:
            conditions.append(Receipt.date >= date.fromisoformat(from_date))
        if to_date:
            conditions.append(Receipt.date <= date.fromisoformat(to_date))

        query = (
            select(Receipt)
            .where(*conditions)
            .options(
                selectinload(Receipt.line_items),
                selectinload(Receipt.store),
            )
        )

        count_subquery = select(Receipt.id).where(*conditions)

        if store:
            store_filter = Store.normalized_name.ilike(f"%{store.lower()}%")
            query = query.join(Receipt.store).where(store_filter)
            count_subquery = count_subquery.join(
                Store, Receipt.store_id == Store.id
            ).where(store_filter)

        count_query = select(func.count()).select_from(count_subquery.subquery())

        query = query.order_by(Receipt.date.desc(), Receipt.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        receipts = list(result.scalars().unique().all())

        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        return receipts, total

    async def _get_receipt(
        self,
        receipt_id: uuid.UUID,
        user_id: uuid.UUID,
        *,
        include_deleted: bool = False,
    ) -> Receipt:
        conditions = [Receipt.id == receipt_id, Receipt.user_id == user_id]
        if not include_deleted:
            conditions.append(Receipt.deleted_at.is_(None))
        result = await self.db.execute(
            select(Receipt)
            .options(
                selectinload(Receipt.line_items),
                selectinload(Receipt.store),
            )
            .where(*conditions)
        )
        receipt = result.scalar_one_or_none()
        if receipt is None:
            raise ValueError(f"Receipt {receipt_id} not found")
        return receipt

    async def soft_delete_receipt(
        self, receipt_id: uuid.UUID, user_id: uuid.UUID
    ) -> Receipt:
        receipt = await self._get_receipt(receipt_id, user_id)
        receipt.deleted_at = datetime.now(UTC)
        await self.db.flush()
        return receipt

    async def restore_receipt(
        self, receipt_id: uuid.UUID, user_id: uuid.UUID
    ) -> Receipt:
        receipt = await self._get_receipt(receipt_id, user_id, include_deleted=True)
        if receipt.deleted_at is None:
            return receipt
        deleted_at = receipt.deleted_at
        if deleted_at.tzinfo is None:
            deleted_at = deleted_at.replace(tzinfo=UTC)
        if deleted_at < restore_cutoff():
            raise ValueError("Receipt past 30-day restore window")
        receipt.deleted_at = None
        await self.db.flush()
        return receipt

    async def list_recently_deleted(self, user_id: uuid.UUID) -> list[Receipt]:
        cutoff = restore_cutoff()
        # SQLite-friendly cutoff (naive) for in-memory tests; Postgres ignores TZ.
        cutoff_naive = cutoff.replace(tzinfo=None)
        result = await self.db.execute(
            select(Receipt)
            .options(selectinload(Receipt.store), selectinload(Receipt.line_items))
            .where(
                Receipt.user_id == user_id,
                Receipt.deleted_at.is_not(None),
                Receipt.deleted_at >= cutoff_naive,
            )
            .order_by(Receipt.deleted_at.desc())
        )
        return list(result.scalars().unique().all())

    async def create_manual_receipt(
        self,
        *,
        user_id: uuid.UUID,
        store_name: str,
        receipt_date: date,
        total: float,
        subtotal: float | None,
        tax: float | None,
        currency: str,
        items: list[dict],
    ) -> Receipt:
        """Create a receipt without an image (manual entry fallback)."""
        store = await self.store_service.find_or_create(store_name)
        receipt = Receipt(
            user_id=user_id,
            store_id=store.id,
            date=receipt_date,
            subtotal=subtotal,
            tax=tax,
            total=total,
            currency=currency,
            extraction_confidence=None,
            image_url=None,
            thumbnail_url=None,
            status="confirmed",
        )
        self.db.add(receipt)
        await self.db.flush()

        for item_data in items:
            line = LineItem(
                receipt_id=receipt.id,
                raw_name=item_data["name"],
                quantity=item_data.get("quantity", 1.0),
                unit_price=item_data["unit_price"],
                total_price=item_data["total_price"],
                category_id=item_data.get("category_id"),
                extraction_confidence=None,
                category_confidence=None,
            )
            self.db.add(line)
        await self.db.flush()

        # Re-fetch with eager loading
        receipt = await self._get_receipt(receipt.id, user_id)
        await self._after_confirm(receipt)
        return receipt

    async def _get_user_mappings(
        self, user_id: uuid.UUID
    ) -> dict[str, UserItemMapping]:
        result = await self.db.execute(
            select(UserItemMapping).where(UserItemMapping.user_id == user_id)
        )
        mappings = result.scalars().all()
        return {m.raw_text_pattern: m for m in mappings}

    async def _get_categories(self, user_id: uuid.UUID) -> list[Category]:
        result = await self.db.execute(
            select(Category).where(
                (Category.is_default.is_(True)) | (Category.user_id == user_id)
            )
        )
        return list(result.scalars().all())

    async def _update_item_mapping(
        self,
        user_id: uuid.UUID,
        raw_name: str,
        category_id: uuid.UUID,
    ) -> None:
        pattern = raw_name.strip().lower()
        result = await self.db.execute(
            select(UserItemMapping).where(
                UserItemMapping.user_id == user_id,
                UserItemMapping.raw_text_pattern == pattern,
            )
        )
        mapping = result.scalar_one_or_none()

        if mapping:
            mapping.category_id = category_id
        else:
            mapping = UserItemMapping(
                user_id=user_id,
                raw_text_pattern=pattern,
                category_id=category_id,
            )
            self.db.add(mapping)

    async def _retroactive_category_update(
        self,
        user_id: uuid.UUID,
        raw_name: str,
        new_category_id: uuid.UUID,
    ) -> set[date]:
        """Update category on all historical line items matching
        raw_name for this user.

        Returns the dates of the confirmed, live receipts it changed: the
        spend of the periods that hold them moved.
        """
        pattern = raw_name.strip().lower()
        # Find all matching line items across user's receipts
        result = await self.db.execute(
            select(LineItem, Receipt.date, Receipt.status, Receipt.deleted_at)
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                func.lower(LineItem.raw_name) == pattern,
                LineItem.category_id != new_category_id,
            )
        )
        changed: set[date] = set()
        for item, receipt_date, status, deleted_at in result.all():
            item.category_id = new_category_id
            item.category_confidence = 1.0
            item.corrected = True
            if status == "confirmed" and deleted_at is None:
                changed.add(receipt_date)
        return changed

    async def _check_duplicate(
        self,
        user_id: uuid.UUID,
        store_id: uuid.UUID | None,
        receipt_date: date,
        total: float | None,
        item_count: int,
    ) -> bool:
        """Check for duplicate receipt within last 24 hours."""
        cutoff = datetime.now(UTC) - timedelta(hours=24)

        query = select(Receipt).where(
            Receipt.user_id == user_id,
            Receipt.date == receipt_date,
            Receipt.created_at >= cutoff,
        )
        if store_id:
            query = query.where(Receipt.store_id == store_id)
        if total is not None:
            query = query.where(Receipt.total == total)

        result = await self.db.execute(query)
        existing = result.scalars().all()

        for existing_receipt in existing:
            # Count items for comparison
            item_result = await self.db.execute(
                select(func.count())
                .select_from(LineItem)
                .where(LineItem.receipt_id == existing_receipt.id)
            )
            existing_count = item_result.scalar() or 0
            if existing_count == item_count:
                return True
        return False
