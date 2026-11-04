"""Work with the receipt test set from the command line. Run from backend/.

python -m tests.llm_validation.run check
    Validate every ground-truth file and list what the set still lacks for
    the MVP Definition of Done. No API calls. Exits 1 on an invalid file,
    or on any gap with --strict.

python -m tests.llm_validation.run template de_de_04 [--currency EUR]
    Write an empty ground_truth/de_de_04.json to fill in by hand.

python -m tests.llm_validation.run extract [--runs 5] [--only ID ...]
    Extract every paired receipt (paid API calls), score it, print the
    metrics against the targets and save a JSON report in reports/.
    --runs N repeats each receipt N times to measure consistency.
    --premium runs the Premium extraction model (Priority OCR, PREM-03:
    GG_LLM_PREMIUM_EXTRACTION_MODEL) instead of the default one.
    The report records the mean tokens per scan, for its cost.
    Exits 1 when a target is missed.
"""

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings
from tests.llm_validation import harness


def cmd_check(args: argparse.Namespace) -> int:
    test_set = harness.load_test_set()
    scored = test_set.scored
    print(
        f"{len(scored)} paired receipts, {len(test_set.adversarial)} adversarial, "
        f"target {harness.MIN_RECEIPTS}+"
    )
    for code, name in harness.REQUIRED_LANGUAGES.items():
        have = sum(1 for f in scored if f.truth.language == code)
        print(f"  {code}  {name:<20} {have}/{harness.MIN_RECEIPTS_PER_LANGUAGE}")
    others = sorted(
        {f.truth.language or "" for f in scored} - set(harness.REQUIRED_LANGUAGES)
    )
    if others:
        print("  other languages: " + ", ".join(others))

    gaps = harness.coverage_gaps(test_set)
    if gaps:
        print("\nGaps:")
        for gap in gaps:
            print(f"  - {gap}")
    else:
        print("\nThe set meets the Definition of Done coverage.")
    if test_set.errors or (args.strict and gaps):
        return 1
    return 0


def cmd_template(args: argparse.Namespace) -> int:
    path = harness.GROUND_TRUTH_DIR / f"{args.receipt_id}.json"
    if path.exists():
        print(f"{path} already exists", file=sys.stderr)
        return 1
    adversarial = args.receipt_id.startswith("adversarial_")
    template = {
        "receipt_id": args.receipt_id,
        "store_name": "",
        "date": "YYYY-MM-DD",
        "currency": args.currency,
        "items": [{"name": "", "quantity": 1, "unit_price": 0.0, "total_price": 0.0}],
        "subtotal": None,
        "tax": None,
        "total": 0.0,
        "notes": "",
        "adversarial": adversarial,
    }
    path.write_text(json.dumps(template, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {path}. Copy every value exactly as printed on the receipt.")
    return 0


def build_extractor(settings, premium: bool):
    """The extractor a scan uses: the default model, or the Premium one."""
    from app.llm.provider import LiteLLMReceiptExtractor

    if premium:
        return LiteLLMReceiptExtractor(
            settings, model=settings.llm_premium_extraction_model
        )
    return LiteLLMReceiptExtractor(settings)


def mean_tokens(usages: list[tuple[int | None, int | None] | None]) -> dict:
    """Mean input and output tokens per call, over the calls that report them."""
    known = [u for u in usages if u and u[0] is not None and u[1] is not None]
    if not known:
        return {"calls": 0, "input": None, "output": None}
    return {
        "calls": len(known),
        "input": round(sum(u[0] for u in known) / len(known)),
        "output": round(sum(u[1] for u in known) / len(known)),
    }


async def _extract(args: argparse.Namespace) -> dict:
    from app.llm.prompts.receipt_extraction import PROMPT_VERSION

    extractor = build_extractor(get_settings(), args.premium)
    usages: list = []
    fixtures = harness.load_test_set().scored
    if args.only:
        fixtures = [f for f in fixtures if f.receipt_id in set(args.only)]

    scores: list[harness.ReceiptScore] = []
    strict_consistent = 0
    loose_consistent = 0
    inconsistent: list[str] = []
    for fixture in fixtures:
        runs = []
        for _ in range(args.runs):
            extractor.last_usage = None
            runs.append(await harness.extract_fixture(extractor, fixture))
            usages.append(extractor.last_usage)
        # Accuracy uses the first run, as one scan would.
        score = harness.score_extraction(runs[0])
        scores.append(score)
        status = score.error or (
            f"{score.matched}/{score.expected_items} items, "
            f"{score.field_correct}/{score.field_total} fields"
        )
        print(f"  {fixture.receipt_id:<16} {score.latency_s:6.2f}s  {status}")
        if args.runs > 1:
            results = [r.result for r in runs]
            strict_consistent += harness.is_consistent(results, strict=True)
            loose_consistent += harness.is_consistent(results, strict=False)
            if not harness.is_consistent(results, strict=True):
                inconsistent.append(fixture.receipt_id)

    metrics = harness.aggregate(scores)
    report: dict = {
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "prompt_version": PROMPT_VERSION,
        "model": extractor.model_name,
        "tier": "priority" if args.premium else "standard",
        # Price it with the provider's per-token rates (docs/DEPLOYMENT.md).
        "tokens_per_scan": mean_tokens(usages),
        "runs_per_receipt": args.runs,
        "subset": sorted(args.only) if args.only else None,
        "coverage_gaps": harness.coverage_gaps(harness.load_test_set()),
        "metrics": asdict(metrics),
        "by_language": {
            lang: asdict(m) for lang, m in harness.metrics_by_language(scores).items()
        },
        "receipts": [asdict(s) for s in scores],
    }
    if args.runs > 1 and fixtures:
        report["consistency"] = {
            "rate": strict_consistent / len(fixtures),
            "data_only_rate": loose_consistent / len(fixtures),
            "inconsistent": inconsistent,
        }
    return report


def _targets(report: dict) -> list[tuple[str, str, bool]]:
    m = report["metrics"]
    rows = [
        (
            "field accuracy",
            f"{m['field_accuracy']:.2%}",
            m["field_accuracy"] >= harness.FIELD_ACCURACY_TARGET,
        ),
        (
            "hallucination rate",
            f"{m['hallucination_rate']:.2%}",
            m["hallucination_rate"] <= harness.HALLUCINATION_RATE_TARGET,
        ),
        (
            "item recall",
            f"{m['item_recall']:.2%}",
            m["item_recall"] >= harness.ITEM_RECALL_TARGET,
        ),
    ]
    p95 = m["latency_p95_s"]
    rows.append(
        (
            "latency p95",
            "n/a" if p95 is None else f"{p95:.2f}s",
            p95 is not None and p95 <= harness.LATENCY_P95_TARGET_S,
        )
    )
    if "consistency" in report:
        c = report["consistency"]
        rows.append(
            (
                "consistency",
                f"{c['rate']:.2%} (data only {c['data_only_rate']:.2%})",
                c["rate"] >= harness.CONSISTENCY_TARGET,
            )
        )
    return rows


def cmd_extract(args: argparse.Namespace) -> int:
    if not get_settings().llm_api_key:
        print("GG_LLM_API_KEY is not set (environment or backend/.env).")
        return 2
    if args.premium and not get_settings().llm_premium_extraction_model:
        print("GG_LLM_PREMIUM_EXTRACTION_MODEL is not set (environment or .env).")
        return 2
    if not harness.load_test_set().scored:
        print("No paired receipts. Run `check` to see what's missing.")
        return 2

    report = asyncio.run(_extract(args))
    rows = _targets(report)
    print(f"\nPrompt {report['prompt_version']}, model {report['model']}")
    tokens = report["tokens_per_scan"]
    if tokens["calls"]:
        print(f"  tokens per scan: {tokens['input']} in, {tokens['output']} out")
    for name, value, ok in rows:
        print(f"  {'PASS' if ok else 'FAIL'}  {name:<20} {value}")
    for lang, m in report["by_language"].items():
        print(
            f"  {lang:<12} n={m['receipts']:<3} accuracy {m['field_accuracy']:.2%}"
            f"  recall {m['item_recall']:.2%}"
            f"  hallucination {m['hallucination_rate']:.2%}"
        )
    if report["coverage_gaps"]:
        print("\nThe set has gaps, so these numbers don't count for the DoD yet:")
        for gap in report["coverage_gaps"]:
            print(f"  - {gap}")

    out: Path = args.out or harness.REPORTS_DIR / (
        datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        + f"_{report['prompt_version']}"
        + ("_premium" if args.premium else "")
        + ".json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(f"\nReport: {out}")
    return 0 if all(ok for _, _, ok in rows) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tests.llm_validation.run")
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="validate the set, list coverage gaps")
    check.add_argument("--strict", action="store_true", help="exit 1 on any gap")
    check.set_defaults(func=cmd_check)

    template = sub.add_parser("template", help="write an empty ground-truth file")
    template.add_argument("receipt_id")
    template.add_argument("--currency", default="USD")
    template.set_defaults(func=cmd_template)

    extract = sub.add_parser("extract", help="run and score extraction (paid)")
    extract.add_argument("--runs", type=int, default=1)
    extract.add_argument("--only", nargs="+", metavar="ID")
    extract.add_argument("--out", type=Path)
    extract.add_argument(
        "--premium", action="store_true", help="use the Premium extraction model"
    )
    extract.set_defaults(func=cmd_extract)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
