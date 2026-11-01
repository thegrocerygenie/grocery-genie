---
description: Run the LLM extraction validation harness against the receipt test set. Use after any change to prompts, extraction logic, or LLM provider config.
---

# LLM Extraction Validation

Run from backend/ directory. `tests/llm_validation/README.md` explains the set and the scoring.

1. Run `.venv/bin/python -m tests.llm_validation.run check`. Fix any invalid ground-truth file it reports. If it lists coverage gaps, say so in your report: the numbers below don't count for the Definition of Done until the set has none.
2. Run `.venv/bin/python -m tests.llm_validation.run extract`. It prints each receipt, the metrics against the targets, a per-language breakdown, and saves a JSON report in `tests/llm_validation/reports/`. Targets:
   - Field-level accuracy: must be ≥90%
   - Hallucination rate: must be 0%
   - Item recall: must be ≥95%
   - Extraction latency p95: must be ≤5 s
   - Every language must meet the accuracy, recall and hallucination targets on its own.
3. If thresholds are not met, review the failing receipts, identify the extraction error pattern, and adjust the system prompt in `app/llm/prompts/receipt_extraction.py`.
4. Increment the prompt version number after any change.
5. Re-run the harness after prompt changes to confirm improvement without regression.

## Consistency Check (optional, slower)

Run `.venv/bin/python -m tests.llm_validation.run extract --runs 5` (or `pytest tests/llm_validation/test_extraction_consistency.py -v`).
- Sends each test receipt 5 times with the configured model settings.
- The gate compares the full output, confidence scores included. The report also shows a data-only rate, which tells unstable scores from unstable reading.
- Flags any receipt where outputs vary across runs.
- Target: ≥95% of receipts produce identical output.

## Rules

- Never adjust the ground truth to match the model output. Ground truth is authoritative.
- If a prompt change improves accuracy on some receipts but regresses on others, investigate the regression before shipping.
- Log the prompt version, accuracy metrics, and date after every harness run: commit the report `extract` saved, with the change it measured.
