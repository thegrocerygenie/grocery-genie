"""Data export (NFR Privacy 2, V1.1 Premium per D2): a user's receipts, line
items, categories, budgets and price observations as one JSON document, a zip
of CSVs, or a PDF spend report (PREM-04).

Options (PREM-04): a date range (receipts dated in it, their line items and
the prices they recorded; categories and budgets are settings, never cut by
the range), the sections to include, and receipt images, which turn the
download into a zip of the export and an ``images/`` folder.

Scope is the user's own rows, as every other read: households arrive in V1.5
(no household can hold another user's rows yet). Deleted receipts and budgets
are left out, and so are the line items and prices of a deleted receipt.

Large accounts: rows are read ``BATCH_SIZE`` at a time (keyset pages, no
OFFSET) and written straight into a spooled temporary file (memory up to
``SPOOL_MAX_BYTES``, then disk), so memory stays bounded however many receipts
there are. Receipt images are read one at a time and stored in the zip as
they are (already compressed). The PDF report is held in memory until it is
written, about a kilobyte a page: its receipt list grows by one line per
receipt, everything else is bounded (months x categories, ten top items). The
route then streams that file; the database work is done before the first byte
is sent.
"""

import contextlib
import csv
import hashlib
import io
import json
import shutil
import uuid
import zipfile
from collections.abc import AsyncIterator, Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from tempfile import SpooledTemporaryFile
from typing import IO, Any

from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.image.storage import RECEIPT_EXTS, FileStorage, generate_receipt_path
from app.models.database import (
    Budget,
    CanonicalItem,
    Category,
    LineItem,
    PriceObservation,
    Receipt,
    Store,
    User,
)
from app.models.export import (
    ExportBudget,
    ExportCategory,
    ExportCounts,
    ExportLineItem,
    ExportPriceObservation,
    ExportReceipt,
    ExportReceiptWithLines,
)
from app.services import export_report
from app.services.budget_service import BudgetService, in_budget_currency
from app.services.store_service import StoreService

FORMAT_VERSION = 1
BATCH_SIZE = 500
SPOOL_MAX_BYTES = 8 * 1024 * 1024
CHUNK_BYTES = 64 * 1024


TOP_ITEMS = 10


class ExportBusyError(Exception):
    """The user already has an export being built."""


# Exports being built in this process, for the database that has no advisory
# locks (SQLite, in tests) and for two requests sharing one session.
_building: set[uuid.UUID] = set()


def _lock_key(user_id: uuid.UUID) -> int:
    """A signed 64-bit advisory lock key for the user's export."""
    digest = hashlib.sha256(f"export:{user_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


@contextlib.asynccontextmanager
async def export_slot(db: AsyncSession, user_id: uuid.UUID) -> AsyncIterator[None]:
    """One export at a time per user, or ``ExportBusyError``.

    On Postgres a transaction-level advisory lock on the request's session:
    every API worker shares it, and the database releases it when the
    request's transaction ends, committed or rolled back, even if the worker
    dies. An in-process set covers this worker (and SQLite) and is released
    when the block exits, on success or error.
    """
    if user_id in _building:
        raise ExportBusyError
    _building.add(user_id)
    try:
        if db.get_bind().dialect.name == "postgresql":
            got = await db.scalar(
                text("SELECT pg_try_advisory_xact_lock(:key)"),
                {"key": _lock_key(user_id)},
            )
            if not got:
                raise ExportBusyError
        yield
    finally:
        _building.discard(user_id)


class ExportFormat(StrEnum):
    JSON = "json"
    CSV = "csv"
    PDF = "pdf"


class ExportInclude(StrEnum):
    """The "Includes" switches (PREM-04 AC 3), in the screen's order."""

    RECEIPTS = "receipts"  # Receipts & line items
    PRICES = "prices"  # Price history
    BUDGETS = "budgets"  # Categories & budgets
    IMAGES = "images"  # Receipt images


DEFAULT_INCLUDES = frozenset(
    {ExportInclude.RECEIPTS, ExportInclude.PRICES, ExportInclude.BUDGETS}
)


def parse_includes(raw: str | None) -> frozenset[ExportInclude]:
    """``receipts,prices`` as a set of includes; ``None`` is the default (all
    but images). Raises ``ValueError`` for an unknown or empty list."""
    if raw is None:
        return DEFAULT_INCLUDES
    parts = [part.strip() for part in raw.split(",")]
    if not any(parts) or not all(parts):
        raise ValueError("include names at least one section")
    try:
        return frozenset(ExportInclude(part) for part in parts)
    except ValueError:
        raise ValueError(
            "include takes " + ", ".join(i.value for i in ExportInclude)
        ) from None


@dataclass(frozen=True)
class ExportOptions:
    """What to export: the format, the range (inclusive; ``None`` is open)
    and the sections."""

    fmt: ExportFormat = ExportFormat.JSON
    start: date | None = None
    end: date | None = None
    includes: frozenset[ExportInclude] = DEFAULT_INCLUDES

    def has(self, include: ExportInclude) -> bool:
        return include in self.includes

    @property
    def include_names(self) -> list[str]:
        return [i.value for i in ExportInclude if i in self.includes]

    def receipts_in_range(self) -> list[Any]:
        where: list[Any] = []
        if self.start is not None:
            where.append(Receipt.date >= self.start)
        if self.end is not None:
            where.append(Receipt.date <= self.end)
        return where


# A spreadsheet runs a cell that starts with one of these as a formula
# (OWASP "CSV injection"). Every text cell comes from a receipt or the user.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

# Quantities keep three decimals in CSV; every other number is money (two).
_THREE_PLACES = {"quantity"}


def csv_text(value: str | None) -> str:
    """A text cell, with a leading ``'`` if a spreadsheet would run it."""
    if not value:
        return ""
    if value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _csv_cell(name: str, value: Any) -> str | int:
    match value:
        case None:
            return ""
        case bool():
            return "true" if value else "false"
        case int():
            return value
        case float():
            places = 3 if name in _THREE_PLACES else 2
            return f"{Decimal(str(value)):.{places}f}"
        case uuid.UUID():
            return str(value)
        case date():  # datetime too
            return value.isoformat()
        case str():
            return csv_text(value)
    raise TypeError(f"no CSV form for {name}: {type(value).__name__}")


def _csv_row(model: BaseModel, columns: Sequence[str]) -> list[str | int]:
    return [_csv_cell(name, getattr(model, name)) for name in columns]


def _columns(model: type[BaseModel]) -> list[str]:
    return list(model.model_fields)


RECEIPT_COLUMNS = _columns(ExportReceipt)
LINE_ITEM_COLUMNS = _columns(ExportLineItem)
BUDGET_COLUMNS = _columns(ExportBudget)
CATEGORY_COLUMNS = _columns(ExportCategory)
PRICE_COLUMNS = _columns(ExportPriceObservation)


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)  # SQLite returns naive datetimes
    return value


def _num(value: Decimal | float | None) -> float | None:
    return None if value is None else float(value)


@dataclass
class ExportFile:
    """The finished export, ready to stream."""

    file: IO[bytes]
    size: int
    media_type: str
    filename: str
    counts: ExportCounts

    def chunks(self) -> Iterator[bytes]:
        try:
            self.file.seek(0)
            while chunk := self.file.read(CHUNK_BYTES):
                yield chunk
        finally:
            self.close()

    def close(self) -> None:
        """Release the spooled file. Safe to call more than once; the caller
        calls it on every path, streamed or not (a client that left before the
        first byte never starts ``chunks``)."""
        self.file.close()


def _spool() -> IO[bytes]:
    return SpooledTemporaryFile(max_size=SPOOL_MAX_BYTES)  # noqa: SIM115 - closed by the caller


class ExportService:
    def __init__(self, db: AsyncSession, storage: FileStorage | None = None) -> None:
        self.db = db
        # Where receipt images are; needed only to include them.
        self.storage = storage

    # --- reads ----------------------------------------------------------------

    async def _category_names(self, user_id: uuid.UUID) -> dict[uuid.UUID, str]:
        rows = await self.db.execute(
            select(Category.id, Category.name).where(
                (Category.user_id == user_id) | Category.user_id.is_(None)
            )
        )
        return {row.id: row.name for row in rows}

    async def count_receipts(self, user_id: uuid.UUID, options: ExportOptions) -> int:
        """The receipts an export of ``options``' range holds (PREM-04 AC 4)."""
        count = await self.db.scalar(
            select(func.count())
            .select_from(Receipt)
            .where(
                Receipt.user_id == user_id,
                Receipt.deleted_at.is_(None),
                *options.receipts_in_range(),
            )
        )
        return int(count or 0)

    async def _categories(self, user_id: uuid.UUID) -> list[ExportCategory]:
        # The built-in eight and the user's own: one read is bounded enough.
        rows = await self.db.execute(
            select(Category)
            .where(Category.is_default.is_(True) | (Category.user_id == user_id))
            .order_by(Category.sort_order, Category.name)
        )
        return [
            ExportCategory(
                id=c.id,
                name=c.name,
                is_default=bool(c.is_default),
                color=c.color,
                icon=c.icon,
            )
            for c in rows.scalars()
        ]

    async def _receipt_batches(
        self, user_id: uuid.UUID, options: ExportOptions
    ) -> AsyncIterator[list[tuple[Receipt, Store | None]]]:
        """Not-deleted receipts dated in the range, oldest first,
        ``BATCH_SIZE`` at a time (keyset on date, id)."""
        after: tuple[date, uuid.UUID] | None = None
        while True:
            query = (
                select(Receipt, Store)
                .outerjoin(Store, Store.id == Receipt.store_id)
                .where(
                    Receipt.user_id == user_id,
                    Receipt.deleted_at.is_(None),
                    *options.receipts_in_range(),
                )
                .order_by(Receipt.date, Receipt.id)
                .limit(BATCH_SIZE)
            )
            if after is not None:
                d, rid = after
                query = query.where(
                    (Receipt.date > d) | ((Receipt.date == d) & (Receipt.id > rid))
                )
            rows = [(r, s) for r, s in (await self.db.execute(query)).all()]
            if not rows:
                return
            yield rows
            after = (rows[-1][0].date, rows[-1][0].id)
            if len(rows) < BATCH_SIZE:
                return

    async def _line_items(
        self, receipt_ids: Sequence[uuid.UUID], categories: dict[uuid.UUID, str]
    ) -> dict[uuid.UUID, list[ExportLineItem]]:
        rows = await self.db.execute(
            select(LineItem, CanonicalItem.canonical_name)
            .outerjoin(CanonicalItem, CanonicalItem.id == LineItem.canonical_item_id)
            .where(LineItem.receipt_id.in_(receipt_ids))
            .order_by(LineItem.receipt_id, LineItem.position, LineItem.id)
        )
        by_receipt: dict[uuid.UUID, list[ExportLineItem]] = {}
        for line, canonical_name in rows.all():
            by_receipt.setdefault(line.receipt_id, []).append(
                ExportLineItem(
                    id=line.id,
                    receipt_id=line.receipt_id,
                    position=line.position,
                    name=line.raw_name,
                    quantity=float(line.quantity),
                    unit_price=float(line.unit_price),
                    total_price=float(line.total_price),
                    unit_of_measure=line.unit_of_measure,
                    category=categories.get(line.category_id)
                    if line.category_id
                    else None,
                    canonical_item_id=line.canonical_item_id,
                    canonical_item_name=canonical_name,
                    corrected=bool(line.corrected),
                )
            )
        return by_receipt

    async def _budgets(
        self, user: User, categories: dict[uuid.UUID, str]
    ) -> list[ExportBudget]:
        # A user has a few budgets a month: one read is bounded enough.
        rows = await self.db.execute(
            select(Budget)
            .where(Budget.user_id == user.id, Budget.deleted_at.is_(None))
            .order_by(Budget.period_start, Budget.id)
        )
        currency = user.currency_preference or "USD"
        return [
            ExportBudget(
                id=b.id,
                category=categories.get(b.category_id) if b.category_id else None,
                category_id=b.category_id,
                amount=float(b.amount),
                currency=currency,
                period_type=b.period_type,
                period_start=b.period_start,
                rollover_enabled=bool(b.rollover_enabled),
                created_at=_aware(b.created_at),
            )
            for b in rows.scalars()
        ]

    async def _price_batches(
        self, user_id: uuid.UUID, options: ExportOptions
    ) -> AsyncIterator[list[ExportPriceObservation]]:
        """Observations on not-deleted receipts dated in the range (as price
        history reads them), oldest first, keyset on date, id."""
        after: tuple[date, uuid.UUID] | None = None
        while True:
            query = (
                select(PriceObservation, CanonicalItem.canonical_name, Store.name)
                .join(Receipt, Receipt.id == PriceObservation.receipt_id)
                .join(
                    CanonicalItem,
                    CanonicalItem.id == PriceObservation.canonical_item_id,
                )
                .outerjoin(Store, Store.id == PriceObservation.store_id)
                .where(
                    PriceObservation.user_id == user_id,
                    Receipt.user_id == user_id,
                    Receipt.deleted_at.is_(None),
                    *options.receipts_in_range(),
                )
                .order_by(PriceObservation.date, PriceObservation.id)
                .limit(BATCH_SIZE)
            )
            if after is not None:
                d, oid = after
                query = query.where(
                    (PriceObservation.date > d)
                    | ((PriceObservation.date == d) & (PriceObservation.id > oid))
                )
            rows = (await self.db.execute(query)).all()
            if not rows:
                return
            # The store as the user's price history groups it (their merges);
            # a receipt row keeps the store printed on it.
            groups = await StoreService(self.db).groups(
                user_id, {obs.store_id for obs, _, _ in rows}
            )
            yield [
                ExportPriceObservation(
                    id=obs.id,
                    date=obs.date,
                    canonical_item_id=obs.canonical_item_id,
                    item_name=item_name,
                    store_name=(
                        groups[obs.store_id].name
                        if obs.store_id in groups
                        else store_name
                    ),
                    unit_price=float(obs.unit_price),
                    quantity=float(obs.quantity),
                    unit_of_measure=obs.unit_of_measure,
                    currency=obs.currency,
                    receipt_id=obs.receipt_id,
                    line_item_id=obs.line_item_id,
                )
                for obs, item_name, store_name in rows
            ]
            last = rows[-1][0]
            after = (last.date, last.id)
            if len(rows) < BATCH_SIZE:
                return

    @staticmethod
    def _receipt(receipt: Receipt, store: Store | None) -> ExportReceipt:
        return ExportReceipt(
            id=receipt.id,
            date=receipt.date,
            # The name on the user's own receipt, never the shared row's.
            store_name=receipt.store_name,
            store_location=store.location if store else None,
            subtotal=_num(receipt.subtotal),
            tax=_num(receipt.tax),
            total=_num(receipt.total),
            currency=receipt.currency,
            status=receipt.status,
            created_at=_aware(receipt.created_at),
        )

    # --- writers --------------------------------------------------------------

    async def build(self, user: User, options: ExportOptions) -> ExportFile:
        today = clock.now().date().isoformat()
        out = _spool()
        try:
            if options.has(ExportInclude.IMAGES):
                counts = await self._write_zip_with_images(user, options, out, today)
                media_type, ext = "application/zip", "zip"
            elif options.fmt is ExportFormat.JSON:
                counts = await self._write_json(user, options, out)
                media_type, ext = "application/json", "json"
            elif options.fmt is ExportFormat.CSV:
                with zipfile.ZipFile(
                    out, mode="w", compression=zipfile.ZIP_DEFLATED
                ) as zf:
                    counts = await self._write_csv_entries(user, options, zf)
                media_type, ext = "application/zip", "zip"
            else:
                counts = await self._write_pdf(user, options, out)
                media_type, ext = "application/pdf", "pdf"
        except BaseException:
            out.close()
            raise
        stem = "report" if media_type == "application/pdf" else "export"
        return ExportFile(
            file=out,
            size=out.tell(),
            media_type=media_type,
            filename=f"grocery-genie-{stem}-{today}.{ext}",
            counts=counts,
        )

    async def _write_zip_with_images(
        self, user: User, options: ExportOptions, out: IO[bytes], today: str
    ) -> ExportCounts:
        """The export (CSV files at the top, or the one JSON or PDF file) and
        ``images/``, one zip (PREM-04 AC 3)."""
        with zipfile.ZipFile(out, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            match options.fmt:
                case ExportFormat.CSV:
                    counts = await self._write_csv_entries(user, options, zf)
                case ExportFormat.JSON:
                    name = f"grocery-genie-export-{today}.json"
                    with zf.open(name, mode="w", force_zip64=True) as entry:
                        counts = await self._write_json(user, options, entry)
                case ExportFormat.PDF:
                    name = f"grocery-genie-report-{today}.pdf"
                    with zf.open(name, mode="w", force_zip64=True) as entry:
                        counts = await self._write_pdf(user, options, entry)
            await self._write_images(user, options, zf, counts)
        return counts

    async def _write_images(
        self,
        user: User,
        options: ExportOptions,
        zf: zipfile.ZipFile,
        counts: ExportCounts,
    ) -> None:
        """Each scanned receipt's image as ``images/<receipt id>.<ext>``, one
        at a time. A manual receipt has none; an image no longer stored is
        left out. ``images/README.txt`` says how many of each."""
        if self.storage is None:
            raise RuntimeError("receipt images need the file storage")
        async for batch in self._receipt_batches(user.id, options):
            for receipt, _store in batch:
                data, ext = None, None
                if receipt.image_url is not None:
                    data, ext = await self._receipt_image(self.storage, receipt.id)
                if data is None:
                    counts.images_left_out += 1
                    continue
                # JPEG, PNG, HEIC and PDF are compressed already.
                zf.writestr(
                    f"images/{receipt.id}{ext}",
                    data,
                    compress_type=zipfile.ZIP_STORED,
                )
                counts.image_count += 1
        zf.writestr("images/README.txt", _images_note(counts))

    @staticmethod
    async def _receipt_image(
        storage: FileStorage, receipt_id: uuid.UUID
    ) -> tuple[bytes | None, str | None]:
        """The image the receipt screen shows: the first stored of
        ``RECEIPT_EXTS`` (a HEIC or PDF upload's JPEG copy first)."""
        for ext in RECEIPT_EXTS:
            data = await storage.read(generate_receipt_path(receipt_id, ext))
            if data is not None:
                return data, ext
        return None, None

    async def _write_json(
        self, user: User, options: ExportOptions, out: IO[bytes]
    ) -> ExportCounts:
        """One JSON document, written array element by array element. A
        section switched off is left out, key and all."""
        counts = ExportCounts()
        categories = await self._category_names(user.id)

        def put(text: str) -> None:
            out.write(text.encode("utf-8"))

        def elements(models: Sequence[BaseModel], first: bool) -> bool:
            for model in models:
                put(("" if first else ",") + model.model_dump_json())
                first = False
            return first

        exported_at = clock.now().astimezone(UTC).isoformat().replace("+00:00", "Z")
        header = {
            "format_version": FORMAT_VERSION,
            "exported_at": exported_at,
            "currency": user.currency_preference or "USD",
            "range": {
                "from": options.start.isoformat() if options.start else None,
                "to": options.end.isoformat() if options.end else None,
            },
            "includes": options.include_names,
        }
        # The header object, left open for the sections.
        put(json.dumps(header, separators=(",", ":"))[:-1])

        if options.has(ExportInclude.RECEIPTS):
            put(',"receipts":[')
            first = True
            async for batch in self._receipt_batches(user.id, options):
                lines = await self._line_items([r.id for r, _ in batch], categories)
                rows: list[BaseModel] = []
                for receipt, store in batch:
                    own = lines.get(receipt.id, [])
                    rows.append(
                        ExportReceiptWithLines(
                            **self._receipt(receipt, store).model_dump(),
                            line_items=own,
                        )
                    )
                    counts.receipt_count += 1
                    counts.line_item_count += len(own)
                first = elements(rows, first)
            put("]")
        else:
            counts.receipt_count = await self.count_receipts(user.id, options)

        if options.has(ExportInclude.BUDGETS):
            all_categories = await self._categories(user.id)
            counts.category_count = len(all_categories)
            put(',"categories":[')
            elements(all_categories, True)
            budgets = await self._budgets(user, categories)
            counts.budget_count = len(budgets)
            put('],"budgets":[')
            elements(budgets, True)
            put("]")

        if options.has(ExportInclude.PRICES):
            put(',"price_observations":[')
            first = True
            async for prices in self._price_batches(user.id, options):
                counts.price_observation_count += len(prices)
                first = elements(prices, first)
            put("]")
        put("}")
        return counts

    async def _write_csv_entries(
        self, user: User, options: ExportOptions, zf: zipfile.ZipFile
    ) -> ExportCounts:
        """``receipts.csv`` and ``line_items.csv``, ``categories.csv`` and
        ``budgets.csv``, and ``price_observations.csv``, as switched on, into
        ``zf``. UTF-8 with a BOM so Excel reads accented names. One pass over
        receipts: a zip entry is written whole before the next starts, so line
        items wait in a spooled file of their own."""
        counts = ExportCounts()
        categories = await self._category_names(user.id)

        if options.has(ExportInclude.RECEIPTS):
            with _spool() as lines_raw:
                lines_text = io.TextIOWrapper(
                    lines_raw, encoding="utf-8-sig", newline="", write_through=True
                )
                lines_csv = csv.writer(lines_text)
                lines_csv.writerow(LINE_ITEM_COLUMNS)
                with _CsvEntry(zf, "receipts.csv", RECEIPT_COLUMNS) as receipts_csv:
                    async for batch in self._receipt_batches(user.id, options):
                        lines = await self._line_items(
                            [r.id for r, _ in batch], categories
                        )
                        for receipt, store in batch:
                            counts.receipt_count += 1
                            receipts_csv.writerow(
                                _csv_row(self._receipt(receipt, store), RECEIPT_COLUMNS)
                            )
                            for line in lines.get(receipt.id, []):
                                counts.line_item_count += 1
                                lines_csv.writerow(_csv_row(line, LINE_ITEM_COLUMNS))
                lines_text.flush()
                lines_raw.seek(0)
                with zf.open("line_items.csv", mode="w", force_zip64=True) as entry:
                    shutil.copyfileobj(lines_raw, entry, CHUNK_BYTES)
                lines_text.detach()
        else:
            counts.receipt_count = await self.count_receipts(user.id, options)

        if options.has(ExportInclude.BUDGETS):
            with _CsvEntry(zf, "categories.csv", CATEGORY_COLUMNS) as categories_csv:
                for category in await self._categories(user.id):
                    counts.category_count += 1
                    categories_csv.writerow(_csv_row(category, CATEGORY_COLUMNS))
            with _CsvEntry(zf, "budgets.csv", BUDGET_COLUMNS) as budgets_csv:
                for budget in await self._budgets(user, categories):
                    counts.budget_count += 1
                    budgets_csv.writerow(_csv_row(budget, BUDGET_COLUMNS))

        if options.has(ExportInclude.PRICES):
            with _CsvEntry(zf, "price_observations.csv", PRICE_COLUMNS) as prices_csv:
                async for prices in self._price_batches(user.id, options):
                    for obs in prices:
                        counts.price_observation_count += 1
                        prices_csv.writerow(_csv_row(obs, PRICE_COLUMNS))
        return counts

    # --- PDF report (PREM-04 AC 5) -----------------------------------------------

    @staticmethod
    def _spend_filter(user_id: uuid.UUID, options: ExportOptions) -> list[Any]:
        """What the budget dashboard counts as spend, in the range."""
        return [
            Receipt.user_id == user_id,
            Receipt.status == "confirmed",
            Receipt.deleted_at.is_(None),
            in_budget_currency(user_id),
            *options.receipts_in_range(),
        ]

    async def _monthly_spend(
        self, user_id: uuid.UUID, options: ExportOptions
    ) -> list[export_report.MonthSpend]:
        """Spend per month and category. Grouped by day in SQL (portable
        across Postgres and SQLite), then by month here: at most days x
        categories rows."""
        names = await self._category_names(user_id)
        rows = await self.db.execute(
            select(Receipt.date, LineItem.category_id, func.sum(LineItem.total_price))
            .join(Receipt, LineItem.receipt_id == Receipt.id)
            .where(*self._spend_filter(user_id, options))
            .group_by(Receipt.date, LineItem.category_id)
        )
        months: dict[date, dict[str, float]] = {}
        for day, category_id, spent in rows.all():
            name = names.get(category_id) if category_id else None
            by_category = months.setdefault(export_report.month_start(day), {})
            key = name or "Uncategorized"
            by_category[key] = by_category.get(key, 0.0) + float(spent or 0)
        return [
            export_report.MonthSpend(
                month=month,
                total=round(sum(by_category.values()), 2),
                categories=sorted(
                    ((n, round(v, 2)) for n, v in by_category.items()),
                    key=lambda nv: (-nv[1], nv[0]),
                ),
            )
            for month, by_category in sorted(months.items())
        ]

    async def _write_pdf(
        self, user: User, options: ExportOptions, out: IO[bytes]
    ) -> ExportCounts:
        counts = ExportCounts(receipt_count=await self.count_receipts(user.id, options))
        report = export_report.SpendReport(
            start=options.start,
            end=options.end,
            currency=user.currency_preference or "USD",
            receipt_count=counts.receipt_count,
            exported_on=clock.now().date(),
        )
        if options.has(ExportInclude.BUDGETS):
            report.monthly_spend(await self._monthly_spend(user.id, options))
        if options.has(ExportInclude.RECEIPTS):
            top = await BudgetService(self.db).get_top_items(
                user.id,
                options.start or date.min,
                options.end or date.max,
                limit=TOP_ITEMS,
            )
            report.top_items(
                [
                    export_report.TopItem(
                        name=t.name, count=t.count, spent=t.total_spent
                    )
                    for t in top
                ]
            )
            report.receipts_header()
            async for batch in self._receipt_batches(user.id, options):
                for receipt, _store in batch:
                    report.receipt(
                        export_report.ReceiptRow(
                            day=receipt.date,
                            store=receipt.store_name,
                            total=_num(receipt.total),
                            currency=receipt.currency,
                            confirmed=receipt.status == "confirmed",
                        )
                    )
        out.write(report.output())
        return counts


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _images_note(counts: ExportCounts) -> str:
    return (
        "Receipt images\n\n"
        f"{_plural(counts.image_count, 'receipt image', 'receipt images')}, "
        "each named by its receipt's id (the id in receipts.csv or in the "
        "JSON export).\n"
        f"{_plural(counts.images_left_out, 'receipt has', 'receipts have')} "
        "no image: entered by hand, or the image is no longer stored.\n"
    )


class _CsvEntry:
    """One CSV file inside the zip, with its header, written as rows arrive."""

    def __init__(self, zf: zipfile.ZipFile, name: str, header: list[str]) -> None:
        self._text = io.TextIOWrapper(
            zf.open(name, mode="w"), encoding="utf-8-sig", newline=""
        )
        self._header = header

    def __enter__(self) -> Any:
        writer = csv.writer(self._text)
        writer.writerow(self._header)
        return writer

    def __exit__(self, *exc: object) -> None:
        self._text.close()  # flushes, then closes the zip entry
