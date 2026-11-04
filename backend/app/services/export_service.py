"""Data export (NFR Privacy 2, V1.1 Premium per D2): a user's receipts, line
items, budgets and price observations as one JSON document or a zip of CSVs.

Scope is the user's own rows, as every other read: households arrive in V1.5
(no household can hold another user's rows yet). Deleted receipts and budgets
are left out, and so are the line items and prices of a deleted receipt.

Large accounts: rows are read ``BATCH_SIZE`` at a time (keyset pages, no
OFFSET) and written straight into a spooled temporary file (memory up to
``SPOOL_MAX_BYTES``, then disk), so memory stays bounded however many receipts
there are. The route then streams that file; the database work is done before
the first byte is sent.
"""

import csv
import io
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
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
    ExportCounts,
    ExportLineItem,
    ExportPriceObservation,
    ExportReceipt,
    ExportReceiptWithLines,
)

FORMAT_VERSION = 1
BATCH_SIZE = 500
SPOOL_MAX_BYTES = 8 * 1024 * 1024
CHUNK_BYTES = 64 * 1024


class ExportFormat(StrEnum):
    JSON = "json"
    CSV = "csv"


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
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # --- reads ----------------------------------------------------------------

    async def _category_names(self, user_id: uuid.UUID) -> dict[uuid.UUID, str]:
        rows = await self.db.execute(
            select(Category.id, Category.name).where(
                (Category.user_id == user_id) | Category.user_id.is_(None)
            )
        )
        return {row.id: row.name for row in rows}

    async def _receipt_batches(
        self, user_id: uuid.UUID
    ) -> AsyncIterator[list[tuple[Receipt, Store | None]]]:
        """Not-deleted receipts, oldest first, ``BATCH_SIZE`` at a time
        (keyset on date, id)."""
        after: tuple[date, uuid.UUID] | None = None
        while True:
            query = (
                select(Receipt, Store)
                .outerjoin(Store, Store.id == Receipt.store_id)
                .where(Receipt.user_id == user_id, Receipt.deleted_at.is_(None))
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
        self, user_id: uuid.UUID
    ) -> AsyncIterator[list[ExportPriceObservation]]:
        """Observations on not-deleted receipts (as price history reads them),
        oldest first, keyset on date, id."""
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
            yield [
                ExportPriceObservation(
                    id=obs.id,
                    date=obs.date,
                    canonical_item_id=obs.canonical_item_id,
                    item_name=item_name,
                    store_name=store_name,
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
            store_name=store.name if store else None,
            store_location=store.location if store else None,
            subtotal=_num(receipt.subtotal),
            tax=_num(receipt.tax),
            total=_num(receipt.total),
            currency=receipt.currency,
            status=receipt.status,
            created_at=_aware(receipt.created_at),
        )

    # --- writers --------------------------------------------------------------

    async def build(self, user: User, fmt: ExportFormat) -> ExportFile:
        today = clock.now().date().isoformat()
        out = _spool()
        try:
            if fmt is ExportFormat.JSON:
                counts = await self._write_json(user, out)
                media_type, ext = "application/json", "json"
            else:
                counts = await self._write_csv_zip(user, out)
                media_type, ext = "application/zip", "zip"
        except BaseException:
            out.close()
            raise
        return ExportFile(
            file=out,
            size=out.tell(),
            media_type=media_type,
            filename=f"grocery-genie-export-{today}.{ext}",
            counts=counts,
        )

    async def _write_json(self, user: User, out: IO[bytes]) -> ExportCounts:
        """One JSON document, written array element by array element."""
        counts = ExportCounts()
        categories = await self._category_names(user.id)

        def put(text: str) -> None:
            out.write(text.encode("utf-8"))

        def elements(models: list[BaseModel], first: bool) -> bool:
            for model in models:
                put(("" if first else ",") + model.model_dump_json())
                first = False
            return first

        exported_at = clock.now().astimezone(UTC).isoformat().replace("+00:00", "Z")
        currency = user.currency_preference or "USD"
        put(
            f'{{"format_version":{FORMAT_VERSION},'
            f'"exported_at":"{exported_at}","currency":"{currency}",'
            '"receipts":['
        )
        first = True
        async for batch in self._receipt_batches(user.id):
            lines = await self._line_items([r.id for r, _ in batch], categories)
            rows: list[BaseModel] = []
            for receipt, store in batch:
                own = lines.get(receipt.id, [])
                rows.append(
                    ExportReceiptWithLines(
                        **self._receipt(receipt, store).model_dump(), line_items=own
                    )
                )
                counts.receipt_count += 1
                counts.line_item_count += len(own)
            first = elements(rows, first)

        budgets = await self._budgets(user, categories)
        counts.budget_count = len(budgets)
        put('],"budgets":[')
        elements(list(budgets), True)

        put('],"price_observations":[')
        first = True
        async for prices in self._price_batches(user.id):
            counts.price_observation_count += len(prices)
            first = elements(list(prices), first)
        put("]}")
        return counts

    async def _write_csv_zip(self, user: User, out: IO[bytes]) -> ExportCounts:
        """``receipts.csv``, ``line_items.csv``, ``budgets.csv`` and
        ``price_observations.csv`` in one zip, UTF-8 with a BOM so Excel reads
        accented names. One pass over receipts: a zip entry is written whole
        before the next starts, so line items wait in a spooled file of their
        own."""
        counts = ExportCounts()
        categories = await self._category_names(user.id)

        with zipfile.ZipFile(out, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            with _spool() as lines_raw:
                lines_text = io.TextIOWrapper(
                    lines_raw, encoding="utf-8-sig", newline="", write_through=True
                )
                lines_csv = csv.writer(lines_text)
                lines_csv.writerow(LINE_ITEM_COLUMNS)
                with _CsvEntry(zf, "receipts.csv", RECEIPT_COLUMNS) as receipts_csv:
                    async for batch in self._receipt_batches(user.id):
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
                with zf.open("line_items.csv", mode="w") as entry:
                    shutil.copyfileobj(lines_raw, entry, CHUNK_BYTES)
                lines_text.detach()

            with _CsvEntry(zf, "budgets.csv", BUDGET_COLUMNS) as budgets_csv:
                for budget in await self._budgets(user, categories):
                    counts.budget_count += 1
                    budgets_csv.writerow(_csv_row(budget, BUDGET_COLUMNS))

            with _CsvEntry(zf, "price_observations.csv", PRICE_COLUMNS) as prices_csv:
                async for prices in self._price_batches(user.id):
                    for obs in prices:
                        counts.price_observation_count += 1
                        prices_csv.writerow(_csv_row(obs, PRICE_COLUMNS))
        return counts


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
