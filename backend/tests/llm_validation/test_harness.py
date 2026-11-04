"""Offline tests for the harness itself: they make no LLM calls and always run."""

import io
import json

import pytest
from PIL import Image

from app.llm.schemas import ExtractedLineItem, ReceiptExtractionResult
from tests.llm_validation import harness, run


def _truth(receipt_id: str = "en_us_01", **overrides) -> dict:
    truth = {
        "receipt_id": receipt_id,
        "store_name": "Corner Shop",
        "date": "2026-02-10",
        "currency": "USD",
        "items": [
            {"name": "Milk", "quantity": 1, "unit_price": 2.5, "total_price": 2.5},
            {"name": "Bread", "quantity": 2, "unit_price": 1.0, "total_price": 2.0},
        ],
        "total": 4.5,
        "adversarial": receipt_id.startswith("adversarial_"),
    }
    truth.update(overrides)
    return truth


def _png(width: int = 400, height: int = 600) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


def _pdf() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 600), "white").save(buf, format="PDF")
    return buf.getvalue()


@pytest.fixture
def dirs(tmp_path):
    receipts = tmp_path / "receipts"
    truth = tmp_path / "ground_truth"
    receipts.mkdir()
    truth.mkdir()
    return receipts, truth


def _write(dirs, receipt_id: str, ext: str | None = ".png", **overrides) -> None:
    receipts, truth = dirs
    (truth / f"{receipt_id}.json").write_text(
        json.dumps(_truth(receipt_id, **overrides))
    )
    if ext:
        (receipts / f"{receipt_id}{ext}").write_bytes(_png())


def _result(**overrides) -> ReceiptExtractionResult:
    data = {
        "store_name": "Corner Shop",
        "date": "2026-02-10",
        "currency": "USD",
        "items": [
            ExtractedLineItem(
                name="Milk", quantity=1, unit_price=2.5, total_price=2.5, confidence=1
            ),
            ExtractedLineItem(
                name="Bread", quantity=2, unit_price=1.0, total_price=2.0, confidence=1
            ),
        ],
        "total": 4.5,
        "confidence": 0.9,
    }
    data.update(overrides)
    return ReceiptExtractionResult(**data)


# ---------- the shipped set ----------


def test_every_shipped_ground_truth_file_is_valid():
    """A typo in a ground-truth file would quietly score as a model miss."""
    test_set = harness.load_test_set()
    assert test_set.errors == []
    assert test_set.image_without_truth == []


# ---------- loading ----------


def test_pairs_images_with_ground_truth(dirs):
    _write(dirs, "en_us_01")
    _write(dirs, "de_de_01", ext=".pdf")
    _write(dirs, "fr_fr_01", ext=None)
    (dirs[0] / "es_es_01.jpg").write_bytes(_png())

    test_set = harness.load_test_set(*dirs)

    assert sorted(f.receipt_id for f in test_set.fixtures) == ["de_de_01", "en_us_01"]
    assert test_set.truth_without_image == ["fr_fr_01"]
    assert test_set.image_without_truth == ["es_es_01"]
    assert test_set.errors == []


def test_reports_invalid_ground_truth_instead_of_scoring_it(dirs):
    _write(dirs, "en_us_01", date="10/02/2026")
    _write(dirs, "en_us_02", currency="$")
    _write(dirs, "en_us_03", items=[])
    _write(dirs, "en_us_04", unexpected_field=1)

    test_set = harness.load_test_set(*dirs)

    assert test_set.fixtures == []
    assert len(test_set.errors) == 4
    assert any(e.startswith("en_us_01.json: date") for e in test_set.errors)


def test_receipt_id_must_match_the_file_name(dirs):
    receipts, truth = dirs
    (truth / "en_us_01.json").write_text(json.dumps(_truth("en_us_02")))

    test_set = harness.load_test_set(*dirs)

    assert test_set.errors == [
        "en_us_01.json: receipt_id is 'en_us_02', expected 'en_us_01'"
    ]


def test_receipt_id_must_name_a_language_and_country(dirs):
    _write(dirs, "receipt_1")

    assert "receipt_id" in harness.load_test_set(*dirs).errors[0]


def test_adversarial_flag_must_match_the_id(dirs):
    _write(dirs, "en_us_01", adversarial=True)

    assert "adversarial" in harness.load_test_set(*dirs).errors[0]


def test_two_images_for_one_receipt_is_an_error(dirs):
    _write(dirs, "en_us_01")
    (dirs[0] / "en_us_01.jpg").write_bytes(_png())

    test_set = harness.load_test_set(*dirs)

    assert test_set.fixtures == []
    assert "more than one image" in test_set.errors[0]


def test_adversarial_receipts_stay_out_of_the_scored_set(dirs):
    _write(dirs, "en_us_01")
    _write(dirs, "adversarial_01")

    test_set = harness.load_test_set(*dirs)

    assert [f.receipt_id for f in test_set.scored] == ["en_us_01"]
    assert [f.receipt_id for f in test_set.adversarial] == ["adversarial_01"]


# ---------- image prep ----------


def test_png_goes_to_the_model_as_png(tmp_path):
    """The old harness labelled every image image/jpeg."""
    path = tmp_path / "en_us_01.png"
    path.write_bytes(_png())

    data, content_type = harness.prepare_image(path)

    assert content_type == "image/png"
    assert data == path.read_bytes()


def test_pdf_is_rendered_to_jpeg_as_the_scan_route_does(tmp_path):
    path = tmp_path / "en_us_01.pdf"
    path.write_bytes(_pdf())

    data, content_type = harness.prepare_image(path)

    assert content_type == "image/jpeg"
    assert Image.open(io.BytesIO(data)).format == "JPEG"


# ---------- scoring ----------


def test_a_null_store_name_scores_as_a_miss():
    assert harness.score_store_name(None, "Trader Joe's") is False


def test_null_store_name_is_right_when_the_receipt_prints_none():
    assert harness.score_store_name(None, None) is True
    assert harness.score_store_name("Made Up Store", None) is False


def test_store_name_ignores_case_and_spacing():
    assert harness.score_store_name("  corner   SHOP ", "Corner Shop")


def test_numeric_tolerance_is_relative():
    assert harness.score_numeric(100.0, 101.9)
    assert not harness.score_numeric(100.0, 103.0)
    assert harness.score_numeric(None, None)
    assert not harness.score_numeric(0.5, None)
    assert not harness.score_numeric(0.01, 0)


def test_an_extra_item_is_a_hallucination():
    scores = harness.score_line_items(
        [{"name": "Milk"}, {"name": "Caviar"}], [{"name": "Milk"}]
    )
    assert scores["matched"] == 1
    assert scores["hallucinated"] == 1
    assert scores["missed"] == 0


def test_mandarin_names_match_without_spaces():
    assert harness.name_similarity("牛奶", "牛奶") == 1.0
    assert harness.name_similarity("全脂牛奶", "牛奶") == 0.8


def test_a_perfect_extraction_scores_every_field():
    score = harness.score_receipt(_result(), harness.GroundTruth(**_truth()), 1.2)

    # 4 receipt fields + 3 per item.
    assert (score.field_correct, score.field_total) == (10, 10)
    assert score.wrong_fields == []
    assert score.matched == 2


@pytest.mark.parametrize(
    ("returned", "correct"),
    [
        ("USD", True),
        ("usd", True),
        (None, True),
        ("$", True),
        ("€", False),
        ("EUR", False),
    ],
)
def test_currency_is_scored_as_the_app_saves_it(returned, correct):
    """Prompt v3 returns a code, a one-currency symbol, the symbol as printed
    ($), or null. The app saves the code, or the user's currency for null or
    an ambiguous symbol; the set assumes a local shopper, so the user's
    currency is the receipt's (ground truth)."""
    score = harness.score_receipt(
        _result(currency=returned), harness.GroundTruth(**_truth()), 1.0
    )

    assert ("currency" not in score.wrong_fields) is correct


def test_wrong_receipt_fields_are_named():
    result = _result(currency="EUR", total=9.99, date="2026-02-11")

    score = harness.score_receipt(result, harness.GroundTruth(**_truth()), 1.0)

    assert score.wrong_fields == ["date", "currency", "total"]
    assert score.field_correct == 7


def test_a_failed_call_misses_every_field():
    score = harness.failed_receipt(harness.GroundTruth(**_truth()), 30.0, "Timeout")

    assert (score.field_correct, score.field_total) == (0, 10)
    assert score.matched == 0
    metrics = harness.aggregate([score])
    assert metrics.failed_calls == 1
    assert metrics.item_recall == 0


# ---------- metrics ----------


def test_percentile_is_nearest_rank():
    values = [float(v) for v in range(1, 21)]  # 1..20
    assert harness.percentile(values, 95) == 19.0
    assert harness.percentile(values, 50) == 10.0
    assert harness.percentile([3.0], 95) == 3.0
    assert harness.percentile([], 95) is None


def test_aggregate_pools_fields_across_receipts():
    truth = harness.GroundTruth(**_truth())
    good = harness.score_receipt(_result(), truth, 1.0)
    bad = harness.score_receipt(_result(total=1.0), truth, 9.0)

    metrics = harness.aggregate([good, bad])

    assert metrics.field_accuracy == pytest.approx(19 / 20)
    assert metrics.item_recall == 1.0
    assert metrics.hallucination_rate == 0.0
    assert metrics.latency_p95_s == 9.0


def test_metrics_split_by_language():
    en = harness.score_receipt(_result(), harness.GroundTruth(**_truth()), 1.0)
    de = harness.score_receipt(
        _result(total=1.0), harness.GroundTruth(**_truth("de_de_01")), 1.0
    )

    by_language = harness.metrics_by_language([en, de])

    assert by_language["en"].field_accuracy == 1.0
    assert by_language["de"].field_accuracy == pytest.approx(0.9)


# ---------- consistency ----------


def test_strict_consistency_counts_a_changed_confidence():
    a, b = _result(), _result(confidence=0.8)

    assert not harness.is_consistent([a, b], strict=True)
    assert harness.is_consistent([a, b], strict=False)


def test_a_changed_price_is_inconsistent_either_way():
    a, b = _result(), _result(total=4.6)

    assert not harness.is_consistent([a, b], strict=False)


def test_a_failed_run_is_inconsistent():
    assert not harness.is_consistent([_result(), None])


# ---------- coverage ----------


def test_coverage_names_each_missing_language(dirs):
    _write(dirs, "en_us_01")

    gaps = harness.coverage_gaps(harness.load_test_set(*dirs))

    assert "1 paired receipts; the DoD needs 30+" in gaps
    assert any(g.startswith("Mandarin (zh_*): 0 receipts") for g in gaps)
    assert any("other than USD" in g for g in gaps)
    assert any("adversarial" in g for g in gaps)


def test_a_complete_set_has_no_gaps(dirs):
    for lang, country, currency in [
        ("en", "us", "USD"),
        ("fr", "fr", "EUR"),
        ("es", "es", "EUR"),
        ("de", "de", "EUR"),
        ("sr", "rs", "RSD"),
        ("zh", "cn", "CNY"),
    ]:
        for n in range(1, 6):
            _write(dirs, f"{lang}_{country}_{n:02d}", currency=currency)
    _write(dirs, "adversarial_01")

    assert harness.coverage_gaps(harness.load_test_set(*dirs)) == []


# ---------- CLI ----------


@pytest.fixture
def cli_dirs(dirs, monkeypatch):
    monkeypatch.setattr(harness, "RECEIPTS_DIR", dirs[0])
    monkeypatch.setattr(harness, "GROUND_TRUTH_DIR", dirs[1])
    return dirs


def test_check_passes_with_gaps_and_fails_on_a_bad_file(cli_dirs, capsys):
    _write(cli_dirs, "en_us_01")
    assert run.main(["check"]) == 0
    assert run.main(["check", "--strict"]) == 1

    _write(cli_dirs, "en_us_02", date="tomorrow")
    assert run.main(["check"]) == 1
    assert "en_us_02.json: date" in capsys.readouterr().out


def test_template_writes_a_file_check_rejects_until_filled(cli_dirs):
    assert run.main(["template", "de_de_01", "--currency", "EUR"]) == 0
    path = cli_dirs[1] / "de_de_01.json"
    assert json.loads(path.read_text())["currency"] == "EUR"

    # The placeholder date fails validation, so an unfilled file can't be scored.
    assert any("date" in e for e in harness.load_test_set(*cli_dirs).errors)
    assert run.main(["template", "de_de_01"]) == 1


def test_extract_without_a_key_makes_no_calls(cli_dirs, monkeypatch, capsys):
    monkeypatch.setattr(run, "get_settings", lambda: type("S", (), {"llm_api_key": ""}))

    assert run.main(["extract"]) == 2
    assert "GG_LLM_API_KEY" in capsys.readouterr().out


# ---------- Priority OCR (PREM-03 AC 6) ----------


def test_extract_premium_without_a_premium_model_makes_no_calls(
    cli_dirs, monkeypatch, capsys
):
    settings = type("S", (), {"llm_api_key": "k", "llm_premium_extraction_model": ""})
    monkeypatch.setattr(run, "get_settings", lambda: settings)

    assert run.main(["extract", "--premium"]) == 2
    assert "GG_LLM_PREMIUM_EXTRACTION_MODEL" in capsys.readouterr().out


def test_premium_runs_score_the_premium_model():
    from app.core.config import Settings

    settings = Settings(
        _env_file=None, llm_api_key="k", llm_premium_extraction_model="x/strong"
    )

    assert run.build_extractor(settings, premium=True).model_name == "x/strong"
    assert run.build_extractor(settings, premium=False).model_name == (
        f"{settings.llm_provider}/{settings.llm_model}"
    )


def test_the_report_records_mean_tokens_per_scan():
    assert run.mean_tokens([(3000, 1000), None, (5000, 3000)]) == {
        "calls": 2,
        "input": 4000,
        "output": 2000,
    }
    assert run.mean_tokens([None]) == {"calls": 0, "input": None, "output": None}


# ---------- running ----------


class _FakeExtractor:
    def __init__(self, result=None, error: Exception | None = None):
        self.result, self.error = result, error
        self.calls: list[str] = []

    async def extract(self, image_data: bytes, content_type: str):
        self.calls.append(content_type)
        if self.error:
            raise self.error
        return self.result


async def test_extract_fixture_sends_the_prepared_image(dirs):
    _write(dirs, "en_us_01")
    fixture = harness.load_test_set(*dirs).fixtures[0]
    extractor = _FakeExtractor(result=_result())

    extraction = await harness.extract_fixture(extractor, fixture)

    assert extractor.calls == ["image/png"]
    assert harness.score_extraction(extraction).wrong_fields == []
    assert extraction.latency_s >= 0


async def test_a_raising_extractor_is_scored_as_a_miss(dirs):
    _write(dirs, "en_us_01")
    fixture = harness.load_test_set(*dirs).fixtures[0]
    extractor = _FakeExtractor(error=TimeoutError("slow"))

    score = harness.score_extraction(await harness.extract_fixture(extractor, fixture))

    assert score.error == "TimeoutError"
    assert score.field_correct == 0


def test_extract_writes_a_report_and_fails_a_missed_target(
    cli_dirs, monkeypatch, tmp_path
):
    import app.llm.provider as provider

    _write(cli_dirs, "en_us_01")
    _write(cli_dirs, "en_us_02")
    results = iter([_result(), _result(), _result(), _result(total=1.0)])

    class Extractor(_FakeExtractor):
        model_name = "fake-model"

        def __init__(self, settings):
            super().__init__()

        async def extract(self, image_data, content_type):
            return next(results)

    monkeypatch.setattr(provider, "LiteLLMReceiptExtractor", Extractor)
    monkeypatch.setattr(
        run, "get_settings", lambda: type("S", (), {"llm_api_key": "test"})
    )
    out = tmp_path / "report.json"

    code = run.main(["extract", "--runs", "2", "--out", str(out)])

    report = json.loads(out.read_text())
    assert report["model"] == "fake-model"
    assert report["metrics"]["receipts"] == 2
    assert report["metrics"]["field_accuracy"] == 1.0
    assert report["consistency"] == {
        "rate": 0.5,
        "data_only_rate": 0.5,
        "inconsistent": ["en_us_02"],
    }
    assert any("30+" in gap for gap in report["coverage_gaps"])
    # Consistency 50% < 95%, so the run fails.
    assert code == 1
