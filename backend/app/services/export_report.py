"""The data export's PDF report (PREM-04 AC 5): a spend summary of the range.

Three sections, each left out when its switch is off: monthly spend by
category ("Categories & budgets"), the top items and the receipt list
("Receipts & line items"). Price history has no section of its own.

Spend counts what the budget dashboard counts: confirmed receipts in the
user's currency. The receipt list names every receipt in the export, in its
own currency.

The PDF uses the built-in Helvetica (no font file to ship), which draws
Windows-1252: a letter outside it is drawn without its accent where it has
one, else as "?". JSON and CSV keep every name as it is.
"""

import calendar
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from fpdf import FPDF

from app.core.money import format_money

ENCODING = "windows-1252"

_MARGIN = 18
_TITLE = 20
_HEADING = 14
_BODY = 10
_ROW = 6


# Letters with no decomposition to a base letter.
_BASE = str.maketrans(
    {"Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "ı": "i", "Ħ": "H", "ħ": "h"}
)


def _drawable(char: str) -> bool:
    try:
        char.encode(ENCODING)
    except UnicodeEncodeError:
        return False
    return True


def pdf_text(value: str | None) -> str:
    """``value`` as the core font can draw it."""
    if not value:
        return ""
    if _drawable(value):
        return value
    out: list[str] = []
    for char in value.translate(_BASE):
        if _drawable(char):
            out.append(char)
            continue
        base = "".join(
            c
            for c in unicodedata.normalize("NFKD", char)
            if not unicodedata.combining(c) and _drawable(c)
        )
        out.append(base or "?")
    return "".join(out)


class _Pdf(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(140)
        self.cell(0, 5, f"Grocery Genie · Page {self.page_no()} of {{nb}}", align="C")
        self.set_text_color(0)


def _month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def range_label(start: date | None, end: date | None) -> str:
    """ "Dec 2025 – Sep 2026" for whole months, "Mar 4, 2026 – …" otherwise,
    "All time" with no bounds."""
    whole = (start is None or start.day == 1) and (
        end is None or end == _month_end(end)
    )

    def show(day: date) -> str:
        if whole:
            return day.strftime("%b %Y")
        return f"{day.strftime('%b')} {day.day}, {day.year}"

    match start, end:
        case None, None:
            return "All time"
        case _, None:
            return f"From {show(start)}"
        case None, _:
            return f"Until {show(end)}"
    return f"{show(start)} – {show(end)}"


@dataclass
class MonthSpend:
    month: date  # the first of the month
    total: float
    categories: list[tuple[str, float]]  # most spent first


@dataclass
class TopItem:
    name: str
    count: int
    spent: float


@dataclass
class ReceiptRow:
    day: date
    store: str | None
    total: float | None
    currency: str
    confirmed: bool


class SpendReport:
    """Built section by section, then written out whole."""

    def __init__(
        self,
        *,
        start: date | None,
        end: date | None,
        currency: str,
        receipt_count: int,
        exported_on: date,
    ) -> None:
        self.currency = currency
        pdf = _Pdf(orientation="portrait", unit="mm", format="letter")
        pdf.core_fonts_encoding = ENCODING
        pdf.set_margins(_MARGIN, _MARGIN, _MARGIN)
        pdf.set_auto_page_break(auto=True, margin=_MARGIN)
        pdf.set_title("Grocery Genie spend report")
        pdf.set_creator("Grocery Genie")
        pdf.add_page()
        self.pdf = pdf
        self._width = pdf.w - 2 * _MARGIN

        pdf.set_font("Helvetica", "B", _TITLE)
        pdf.cell(self._width, 10, "Spend report", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", _BODY + 2)
        pdf.cell(self._width, 7, range_label(start, end), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", _BODY)
        pdf.set_text_color(110)
        receipts = "1 receipt" if receipt_count == 1 else f"{receipt_count} receipts"
        pdf.cell(
            self._width,
            _ROW,
            f"{receipts} · Exported {exported_on.strftime('%b')} "
            f"{exported_on.day}, {exported_on.year} · Grocery Genie",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_text_color(0)
        if receipt_count == 0:
            pdf.ln(4)
            pdf.cell(
                self._width,
                _ROW,
                "No receipts in this range.",
                new_x="LMARGIN",
                new_y="NEXT",
            )

    # --- pieces -----------------------------------------------------------------

    def _heading(self, text: str, note: str | None = None) -> None:
        pdf = self.pdf
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", _HEADING)
        pdf.cell(self._width, 9, text, new_x="LMARGIN", new_y="NEXT")
        if note:
            pdf.set_font("Helvetica", "", _BODY - 1)
            pdf.set_text_color(110)
            pdf.multi_cell(self._width, 5, note, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0)
        pdf.set_font("Helvetica", "", _BODY)

    def _row(
        self,
        cells: Sequence[str],
        widths: Sequence[float],
        aligns: Sequence[str],
        *,
        bold: bool = False,
        indent: float = 0,
    ) -> None:
        pdf = self.pdf
        pdf.set_font("Helvetica", "B" if bold else "", _BODY)
        if indent:
            pdf.set_x(pdf.l_margin + indent)
        for i, (text, width, align) in enumerate(
            zip(cells, widths, aligns, strict=True)
        ):
            w = width - (indent if i == 0 else 0)
            # A long store or item name is cut to its column, never wrapped.
            text = pdf_text(text)
            while text and pdf.get_string_width(text) > w - 1:
                text = text[:-2] + "…" if len(text) > 1 else ""
            pdf.cell(w, _ROW, text, align=align)
        pdf.ln(_ROW)

    def _money(self, amount: float, currency: str | None = None) -> str:
        return format_money(amount, currency or self.currency)

    # --- sections -----------------------------------------------------------------

    def monthly_spend(self, months: Sequence[MonthSpend]) -> None:
        self._heading(
            "Monthly spend by category",
            f"Confirmed receipts in {self.currency}, as your budgets count them.",
        )
        if not months:
            self._row(["No spending in this range."], [self._width], ["L"])
            return
        widths = [self._width * 0.7, self._width * 0.3]
        for month in months:
            self.pdf.ln(1)
            self._row(
                [month.month.strftime("%B %Y"), self._money(month.total)],
                widths,
                ["L", "R"],
                bold=True,
            )
            for name, spent in month.categories:
                self._row([name, self._money(spent)], widths, ["L", "R"], indent=6)

    def top_items(self, items: Sequence[TopItem]) -> None:
        self._heading("Top items", f"Most spent on, in {self.currency}.")
        if not items:
            self._row(["No items in this range."], [self._width], ["L"])
            return
        widths = [self._width * 0.6, self._width * 0.15, self._width * 0.25]
        self._row(["Item", "Bought", "Spent"], widths, ["L", "R", "R"], bold=True)
        for item in items:
            self._row(
                [item.name, f"{item.count}×", self._money(item.spent)],
                widths,
                ["L", "R", "R"],
            )

    def receipts_header(self) -> None:
        self._heading("Receipts")
        self._widths = [self._width * 0.22, self._width * 0.53, self._width * 0.25]
        self._row(["Date", "Store", "Total"], self._widths, ["L", "L", "R"], bold=True)

    def receipt(self, row: ReceiptRow) -> None:
        store = row.store or "Unknown store"
        if not row.confirmed:
            store += " (not confirmed)"
        total = "—" if row.total is None else self._money(row.total, row.currency)
        self._row([row.day.isoformat(), store, total], self._widths, ["L", "L", "R"])

    def output(self) -> bytes:
        return bytes(self.pdf.output())


def month_start(day: date) -> date:
    return day.replace(day=1)
