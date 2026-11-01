"""The receipt test set and the scoring the LLM harness runs on it.

The pytest tests and the CLI (``python -m tests.llm_validation.run``) share this
module, so a number in a report means what the gate tests check.

Each receipt is a pair: ``receipts/<receipt_id>.<ext>`` and
``ground_truth/<receipt_id>.json``. A receipt id is ``<language>_<country>_<NN>``
(``de_de_03``), or ``adversarial_<NN>`` for an injection fixture, which the
accuracy metrics leave out.
"""

import math
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.image.normalize import normalize_upload
from app.llm.schemas import ReceiptExtractionResult

HARNESS_DIR = Path(__file__).parent
RECEIPTS_DIR = HARNESS_DIR / "receipts"
GROUND_TRUTH_DIR = HARNESS_DIR / "ground_truth"
REPORTS_DIR = HARNESS_DIR / "reports"

IMAGE_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".pdf": "application/pdf",
}

# MVP Definition of Done (docs/prd/13-validation-strategy.md).
MIN_RECEIPTS = 30
FIELD_ACCURACY_TARGET = 0.90
HALLUCINATION_RATE_TARGET = 0.0
ITEM_RECALL_TARGET = 0.95
CONSISTENCY_TARGET = 0.95
LATENCY_P95_TARGET_S = 5.0
CONSISTENCY_RUNS = 5

# RC-05 AC 1. The extraction prompt claims all six, so the set must hold each.
REQUIRED_LANGUAGES = {
    "en": "English",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "sr": "Serbian (Cyrillic)",
    "zh": "Mandarin",
}
MIN_RECEIPTS_PER_LANGUAGE = 3

NUMERIC_TOLERANCE = 0.02
ITEM_MATCH_THRESHOLD = 0.5

_RECEIPT_ID = re.compile(r"^(?:[a-z]{2}_[a-z]{2}|adversarial)_\d{2,}$")


class GroundTruthItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    quantity: float = Field(default=1.0, gt=0)
    unit_price: float
    total_price: float


class GroundTruth(BaseModel):
    """What a person read off the receipt. It is authoritative: never edit it to
    match the model's answer."""

    model_config = ConfigDict(extra="forbid")

    receipt_id: str
    # Null only when the receipt doesn't print one: the model must say null too.
    store_name: str | None
    date: str | None = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    items: list[GroundTruthItem] = Field(min_length=1)
    subtotal: float | None = None
    tax: float | None = None
    total: float | None
    notes: str = ""
    adversarial: bool = False

    @model_validator(mode="after")
    def check_receipt_id(self) -> Self:
        if not _RECEIPT_ID.match(self.receipt_id):
            raise ValueError(
                f"receipt_id {self.receipt_id!r} must look like de_de_03 "
                "or adversarial_01"
            )
        if self.adversarial != self.receipt_id.startswith("adversarial_"):
            raise ValueError(
                "adversarial must be true exactly for adversarial_* receipt ids"
            )
        return self

    @property
    def language(self) -> str | None:
        """The two-letter language from the id, or None for adversarial ones."""
        return None if self.adversarial else self.receipt_id.split("_", 1)[0]


@dataclass(frozen=True)
class Fixture:
    truth: GroundTruth
    image_path: Path

    @property
    def receipt_id(self) -> str:
        return self.truth.receipt_id


@dataclass
class TestSet:
    fixtures: list[Fixture] = field(default_factory=list)
    # Problems that make the set untrustworthy: a file that won't parse, a name
    # that doesn't match its receipt_id, two images for one receipt.
    errors: list[str] = field(default_factory=list)
    truth_without_image: list[str] = field(default_factory=list)
    image_without_truth: list[str] = field(default_factory=list)

    @property
    def scored(self) -> list[Fixture]:
        """The receipts the accuracy, recall and consistency metrics use."""
        return [f for f in self.fixtures if not f.truth.adversarial]

    @property
    def adversarial(self) -> list[Fixture]:
        return [f for f in self.fixtures if f.truth.adversarial]


def load_test_set(
    receipts_dir: Path | None = None, ground_truth_dir: Path | None = None
) -> TestSet:
    receipts_dir = receipts_dir or RECEIPTS_DIR
    ground_truth_dir = ground_truth_dir or GROUND_TRUTH_DIR
    test_set = TestSet()
    images: dict[str, list[Path]] = {}
    for path in sorted(receipts_dir.iterdir()) if receipts_dir.exists() else []:
        if path.name.startswith("."):
            continue
        if path.suffix.lower() not in IMAGE_CONTENT_TYPES:
            test_set.errors.append(f"{path.name}: unsupported image type")
            continue
        images.setdefault(path.stem, []).append(path)

    truth_ids: set[str] = set()
    for path in sorted(ground_truth_dir.glob("*.json")):
        try:
            truth = GroundTruth.model_validate_json(path.read_text())
        except ValidationError as exc:
            test_set.errors.append(f"{path.name}: {_first_error(exc)}")
            continue
        if truth.receipt_id != path.stem:
            test_set.errors.append(
                f"{path.name}: receipt_id is {truth.receipt_id!r}, "
                f"expected {path.stem!r}"
            )
            continue
        truth_ids.add(truth.receipt_id)
        paths = images.get(truth.receipt_id, [])
        if len(paths) > 1:
            names = ", ".join(p.name for p in paths)
            test_set.errors.append(f"{truth.receipt_id}: more than one image ({names})")
        elif paths:
            test_set.fixtures.append(Fixture(truth, paths[0]))
        else:
            test_set.truth_without_image.append(truth.receipt_id)

    test_set.image_without_truth = sorted(set(images) - truth_ids)
    return test_set


def _first_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    where = ".".join(str(part) for part in error["loc"]) or "file"
    return f"{where}: {error['msg']}"


def prepare_image(path: Path) -> tuple[bytes, str]:
    """The bytes and content type the scan route hands the extractor: HEIC and
    PDF become JPEG first (``normalize_upload``), as in ``POST /scan``."""
    content_type = IMAGE_CONTENT_TYPES[path.suffix.lower()]
    normalized = normalize_upload(path.read_bytes(), content_type)
    return normalized.data, normalized.content_type


# ---------- scoring ----------


def normalize_text(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def score_store_name(extracted: str | None, expected: str | None) -> bool:
    """Exact match after normalizing case and spaces. Null matches only null."""
    if expected is None or extracted is None:
        return expected is None and extracted is None
    return normalize_text(extracted) == normalize_text(expected)


def score_date(extracted: str | None, expected: str | None) -> bool:
    """Exact ISO date match."""
    return extracted == expected


def score_numeric(
    extracted: float | None,
    expected: float | None,
    tolerance: float = NUMERIC_TOLERANCE,
) -> bool:
    """Match within a relative tolerance. Null matches only null."""
    if extracted is None or expected is None:
        return extracted is None and expected is None
    if expected == 0:
        return extracted == 0
    return abs(extracted - expected) / abs(expected) <= tolerance


def name_similarity(extracted: str, expected: str) -> float:
    a, b = normalize_text(extracted), normalize_text(expected)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.8
    # Word overlap. Mandarin has no spaces, so it relies on the two checks above.
    a_words, b_words = set(a.split()), set(b.split())
    return len(a_words & b_words) / max(len(a_words), len(b_words))


def score_line_items(extracted: list[dict], expected: list[dict]) -> dict:
    """Pair each extracted item with its best unpaired expected item by name,
    then score quantity, unit price and line total on each pair.

    Returns matched, missed, hallucinated, field_correct, field_total and
    field_accuracy. An extracted item with no pair counts as hallucinated.
    """
    matched = 0
    field_correct = 0
    field_total = 0
    paired: set[int] = set()

    for ext_item in extracted:
        best_idx = None
        best_similarity = 0.0
        for i, exp_item in enumerate(expected):
            if i in paired:
                continue
            similarity = name_similarity(
                ext_item.get("name", ""), exp_item.get("name", "")
            )
            if similarity > best_similarity:
                best_similarity = similarity
                best_idx = i

        if best_idx is None or best_similarity < ITEM_MATCH_THRESHOLD:
            continue
        matched += 1
        paired.add(best_idx)
        for numeric_field in ("quantity", "unit_price", "total_price"):
            field_total += 1
            if score_numeric(
                ext_item.get(numeric_field), expected[best_idx].get(numeric_field)
            ):
                field_correct += 1

    return {
        "matched": matched,
        "missed": len(expected) - matched,
        "hallucinated": len(extracted) - matched,
        "field_correct": field_correct,
        "field_total": field_total,
        "field_accuracy": field_correct / field_total if field_total else 1.0,
    }


@dataclass
class ReceiptScore:
    receipt_id: str
    language: str | None
    latency_s: float
    expected_items: int
    extracted_items: int
    matched: int
    hallucinated: int
    field_correct: int
    field_total: int
    # Receipt-level fields the model got wrong, for the report.
    wrong_fields: list[str] = field(default_factory=list)
    error: str | None = None


def score_receipt(
    result: ReceiptExtractionResult, truth: GroundTruth, latency_s: float
) -> ReceiptScore:
    """Score one extraction. Fields: store, date, currency, total, then
    quantity, unit price and line total for each matched item."""
    items = score_line_items(
        [item.model_dump() for item in result.items],
        [item.model_dump() for item in truth.items],
    )
    receipt_fields = {
        "store_name": score_store_name(result.store_name, truth.store_name),
        "date": score_date(result.date, truth.date),
        "currency": result.currency.upper() == truth.currency,
        "total": score_numeric(result.total, truth.total),
    }
    return ReceiptScore(
        receipt_id=truth.receipt_id,
        language=truth.language,
        latency_s=latency_s,
        expected_items=len(truth.items),
        extracted_items=len(result.items),
        matched=items["matched"],
        hallucinated=items["hallucinated"],
        field_correct=items["field_correct"] + sum(receipt_fields.values()),
        field_total=items["field_total"] + len(receipt_fields),
        wrong_fields=[name for name, ok in receipt_fields.items() if not ok],
    )


def failed_receipt(truth: GroundTruth, latency_s: float, error: str) -> ReceiptScore:
    """A call that raised: every expected field and item is a miss."""
    return ReceiptScore(
        receipt_id=truth.receipt_id,
        language=truth.language,
        latency_s=latency_s,
        expected_items=len(truth.items),
        extracted_items=0,
        matched=0,
        hallucinated=0,
        field_correct=0,
        field_total=4 + 3 * len(truth.items),
        error=error,
    )


def percentile(values: list[float], pct: float) -> float | None:
    """Nearest-rank percentile: the smallest value with at least pct% of values
    at or below it."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[rank - 1]


@dataclass
class Metrics:
    receipts: int
    field_accuracy: float
    hallucination_rate: float
    item_recall: float
    latency_p50_s: float | None
    latency_p95_s: float | None
    failed_calls: int


def aggregate(scores: list[ReceiptScore]) -> Metrics:
    field_correct = sum(s.field_correct for s in scores)
    field_total = sum(s.field_total for s in scores)
    extracted = sum(s.extracted_items for s in scores)
    expected = sum(s.expected_items for s in scores)
    latencies = [s.latency_s for s in scores]
    return Metrics(
        receipts=len(scores),
        field_accuracy=field_correct / field_total if field_total else 0.0,
        hallucination_rate=(
            sum(s.hallucinated for s in scores) / extracted if extracted else 0.0
        ),
        item_recall=sum(s.matched for s in scores) / expected if expected else 0.0,
        latency_p50_s=percentile(latencies, 50),
        latency_p95_s=percentile(latencies, 95),
        failed_calls=sum(1 for s in scores if s.error),
    )


def metrics_by_language(scores: list[ReceiptScore]) -> dict[str, Metrics]:
    groups: dict[str, list[ReceiptScore]] = {}
    for score in scores:
        groups.setdefault(score.language or "adversarial", []).append(score)
    return {lang: aggregate(group) for lang, group in sorted(groups.items())}


def coverage_gaps(test_set: TestSet) -> list[str]:
    """What the set lacks before its numbers can count for the Definition of
    Done. Empty when the set is ready."""
    gaps = list(test_set.errors)
    scored = test_set.scored
    if len(scored) < MIN_RECEIPTS:
        gaps.append(f"{len(scored)} paired receipts; the DoD needs {MIN_RECEIPTS}+")
    counts: dict[str, int] = {}
    for fixture in scored:
        lang = fixture.truth.language or ""
        counts[lang] = counts.get(lang, 0) + 1
    for code, name in REQUIRED_LANGUAGES.items():
        have = counts.get(code, 0)
        if have < MIN_RECEIPTS_PER_LANGUAGE:
            gaps.append(
                f"{name} ({code}_*): {have} receipts, needs {MIN_RECEIPTS_PER_LANGUAGE}"
            )
    if not any(f.truth.currency != "USD" for f in scored):
        gaps.append("no receipt in a currency other than USD (RC-05 AC 4)")
    if not test_set.adversarial:
        gaps.append("no adversarial_* receipt for the prompt-injection test")
    if test_set.truth_without_image:
        gaps.append(
            "ground truth with no image: " + ", ".join(test_set.truth_without_image)
        )
    if test_set.image_without_truth:
        gaps.append(
            "images with no ground truth: " + ", ".join(test_set.image_without_truth)
        )
    return gaps


# ---------- running ----------


@dataclass
class Extraction:
    fixture: Fixture
    result: ReceiptExtractionResult | None
    latency_s: float
    error: str | None = None


async def extract_fixture(extractor, fixture: Fixture) -> Extraction:
    """One call, timed the way a user feels it: image prep plus the model call."""
    start = time.perf_counter()
    try:
        data, content_type = prepare_image(fixture.image_path)
        result = await extractor.extract(data, content_type)
    except Exception as exc:  # A failed call is a scored miss, not a crash.
        return Extraction(
            fixture, None, time.perf_counter() - start, type(exc).__name__
        )
    return Extraction(fixture, result, time.perf_counter() - start)


def score_extraction(extraction: Extraction) -> ReceiptScore:
    if extraction.result is None:
        return failed_receipt(
            extraction.fixture.truth,
            extraction.latency_s,
            extraction.error or "error",
        )
    return score_receipt(
        extraction.result, extraction.fixture.truth, extraction.latency_s
    )


def comparable_output(result: ReceiptExtractionResult, strict: bool = True) -> str:
    """The output two runs must share to count as consistent.

    Strict (the DoD gate) compares everything the extractor returns, confidence
    scores and warnings included, because they decide what Review flags. The
    loose form compares only the receipt data that reaches the budget; reports
    show it next to the gate to tell flaky scores from flaky reading.
    """
    if strict:
        return result.model_dump_json()
    return result.model_dump_json(
        exclude={
            "confidence": True,
            "store_name_confidence": True,
            "date_confidence": True,
            "total_confidence": True,
            "warnings": True,
            "items": {"__all__": {"confidence", "warnings"}},
        }
    )


def is_consistent(
    results: list[ReceiptExtractionResult | None], strict: bool = True
) -> bool:
    """True when every run succeeded and all runs gave the same output."""
    if not results or any(r is None for r in results):
        return False
    return len({comparable_output(r, strict) for r in results if r is not None}) == 1
