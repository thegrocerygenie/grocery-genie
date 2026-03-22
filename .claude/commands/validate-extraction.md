---
description: Run the LLM extraction validation harness against the receipt test set. Use after any change to prompts, extraction logic, or LLM provider config.
---

# LLM Extraction Validation

Run from backend/ directory:

1. Run `pytest tests/llm_validation/test_extraction_accuracy.py -v --tb=short`
2. Check results against thresholds:
   - Field-level accuracy: must be ≥90%
   - Hallucination rate: must be 0%
   - Item recall: must be ≥95%
3. If thresholds are not met, review the failing receipts, identify the extraction error pattern, and adjust the system prompt in `app/llm/prompts/receipt_extraction.py`.
4. Increment the prompt version number after any change.
5. Re-run the harness after prompt changes to confirm improvement without regression.

## Consistency Check (optional, slower)

Run `pytest tests/llm_validation/test_extraction_consistency.py -v`
- Sends each test receipt 5 times with temperature=0.
- Flags any receipt where outputs vary across runs.
- Target: ≥95% of receipts produce identical output.

## Rules

- Never adjust the ground truth to match the model output. Ground truth is authoritative.
- If a prompt change improves accuracy on some receipts but regresses on others, investigate the regression before shipping.
- Log the prompt version, accuracy metrics, and date after every harness run.
