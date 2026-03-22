from __future__ import annotations

import time
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.events.dispatcher import dispatcher
from app.events.types import ItemCorrected, ReceiptConfirmed
from app.llm.provider import CategoryAssigner, ReceiptExtractor
from app.models.database import (
    Category,
    LineItem,
    Receipt,
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

        # Parse date
        receipt_date = date.fromisoformat(extraction.date)

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
            try:
                assignments = await self.category_assigner.assign(
                    [li.raw_name for li, _ in uncategorized_items]
                )
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
            except Exception:
                pass  # Fallback: items remain uncategorized for user review

        return ReceiptScanResponse(
            receipt_id=receipt.id,
            status=receipt.status,
            extraction=ReceiptExtraction(
                store_name=extraction.store_name,
                date=extraction.date,
                items=item_responses,
                subtotal=extraction.subtotal,
                tax=extraction.tax,
                total=extraction.total,
                currency=extraction.currency,
                confidence=extraction.confidence,
            ),
            duplicate_warning=is_duplicate,
        )

    async def get_receipt(self, receipt_id: uuid.UUID, user_id: uuid.UUID) -> Receipt:
        """Get a single receipt with line items and store."""
        return await self._get_receipt(receipt_id, user_id)

    async def confirm_receipt(self, receipt_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Confirm a receipt, dispatch ReceiptConfirmed, and check budget thresholds."""
        receipt = await self._get_receipt(receipt_id, user_id)
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

        # Check budget thresholds and create notifications
        budget_service = BudgetService(self.db)
        notification_service = NotificationService(self.db)
        breaches = await budget_service.check_thresholds(user_id, receipt.date)
        for breach in breaches:
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

        if updates.items:
            line_items_by_id = {li.id: li for li in receipt.line_items}

            for correction in updates.items:
                line_item = line_items_by_id.get(correction.id)
                if line_item is None:
                    continue

                if (
                    correction.name is not None
                    and correction.name != line_item.raw_name
                ):
                    dispatcher.dispatch(
                        ItemCorrected(
                            line_item_id=line_item.id,
                            field="name",
                            old_value=line_item.raw_name,
                            new_value=correction.name,
                            user_id=user_id,
                        )
                    )
                    if self.analytics:
                        self.analytics.emit(
                            "receipt_correction_made",
                            {
                                "field": "name",
                                "original_value": line_item.raw_name,
                                "corrected_value": correction.name,
                            },
                            user_id,
                        )
                    line_item.raw_name = correction.name
                    line_item.corrected = True

                if (
                    correction.category_id is not None
                    and correction.category_id != line_item.category_id
                ):
                    dispatcher.dispatch(
                        ItemCorrected(
                            line_item_id=line_item.id,
                            field="category_id",
                            old_value=(
                                str(line_item.category_id)
                                if line_item.category_id
                                else ""
                            ),
                            new_value=str(correction.category_id),
                            user_id=user_id,
                        )
                    )
                    if self.analytics:
                        self.analytics.emit(
                            "receipt_correction_made",
                            {
                                "field": "category_id",
                                "original_value": (
                                    str(line_item.category_id)
                                    if line_item.category_id
                                    else ""
                                ),
                                "corrected_value": str(correction.category_id),
                            },
                            user_id,
                        )
                    line_item.category_id = correction.category_id
                    line_item.category_confidence = 1.0
                    line_item.corrected = True

                    # Update user item mapping for future scans
                    await self._update_item_mapping(
                        user_id, line_item.raw_name, correction.category_id
                    )

                    # Retroactive update: apply to all historical instances
                    await self._retroactive_category_update(
                        user_id, line_item.raw_name, correction.category_id
                    )

        if updates.status == "confirmed":
            await self.confirm_receipt(receipt_id, user_id)
        elif updates.status:
            receipt.status = updates.status

        await self.db.flush()
        return receipt

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
        query = (
            select(Receipt)
            .where(Receipt.user_id == user_id)
            .options(
                selectinload(Receipt.line_items),
                selectinload(Receipt.store),
            )
        )

        count_query = select(func.count()).select_from(
            select(Receipt.id).where(Receipt.user_id == user_id).subquery()
        )

        if store:
            query = query.join(Receipt.store).where(
                Store.normalized_name.ilike(f"%{store.lower()}%")
            )
            count_query = select(func.count()).select_from(
                select(Receipt.id)
                .where(Receipt.user_id == user_id)
                .join(Store, Receipt.store_id == Store.id)
                .where(Store.normalized_name.ilike(f"%{store.lower()}%"))
                .subquery()
            )

        if from_date:
            parsed_from = date.fromisoformat(from_date)
            query = query.where(Receipt.date >= parsed_from)
            count_query = select(func.count()).select_from(
                select(Receipt.id)
                .where(
                    Receipt.user_id == user_id,
                    Receipt.date >= parsed_from,
                )
                .subquery()
            )

        if to_date:
            parsed_to = date.fromisoformat(to_date)
            query = query.where(Receipt.date <= parsed_to)

        query = query.order_by(Receipt.date.desc(), Receipt.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        receipts = list(result.scalars().unique().all())

        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        return receipts, total

    async def _get_receipt(self, receipt_id: uuid.UUID, user_id: uuid.UUID) -> Receipt:
        result = await self.db.execute(
            select(Receipt)
            .options(
                selectinload(Receipt.line_items),
                selectinload(Receipt.store),
            )
            .where(Receipt.id == receipt_id, Receipt.user_id == user_id)
        )
        receipt = result.scalar_one_or_none()
        if receipt is None:
            raise ValueError(f"Receipt {receipt_id} not found")
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
    ) -> None:
        """Update category on all historical line items matching
        raw_name for this user."""
        pattern = raw_name.strip().lower()
        # Find all matching line items across user's receipts
        result = await self.db.execute(
            select(LineItem)
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(
                Receipt.user_id == user_id,
                func.lower(LineItem.raw_name) == pattern,
                LineItem.category_id != new_category_id,
            )
        )
        items = result.scalars().all()
        for item in items:
            item.category_id = new_category_id
            item.category_confidence = 1.0
            item.corrected = True

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
