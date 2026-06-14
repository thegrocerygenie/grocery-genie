# LLM Extraction Validation Harness

This is the accuracy gate for the product's core IP (receipt extraction). It is
**code-complete but data-blocked**: the test logic exists and runs, but it needs
(1) real receipt images paired with ground truth and (2) an LLM API key in CI.

Until both are supplied, every accuracy/consistency/regression test `pytest.skip`s
— so the suite is **green but proves nothing about extraction quality**. Treat
the skips as RED for launch purposes.

## What's still required (cannot be auto-generated)

1. **≥10 real receipt images** under `receipts/<receipt_id>.<ext>` (`.jpg`, `.jpeg`,
   `.png`, `.heic`, or `.pdf`). Real photos — synthetic images don't exercise the
   vision model meaningfully.
2. **A ground-truth JSON per image** under `ground_truth/<receipt_id>.json` (see
   schema below). The `receipt_id` must match the image filename stem.
3. **Locale coverage** (per CLAUDE.md / RC-05): US English, UK (DD/MM/YYYY),
   German (comma decimal), French, and one non-Latin (e.g. Serbian Cyrillic or
   Mandarin). Suggested ids: `en_us_*`, `en_gb_*`, `de_de_*`, `fr_fr_*`, `sr_rs_*`.
4. **`GG_LLM_API_KEY`** set in the environment / CI secret store.

A single ground-truth example ships today: `ground_truth/en_us_01.json` — but its
paired image `receipts/en_us_01.jpg` is **missing**, so even it is skipped.

## Ground-truth schema

```json
{
  "receipt_id": "en_us_01",
  "store_name": "Whole Foods Market",
  "date": "2026-02-10",
  "currency": "USD",
  "items": [
    { "name": "Organic Bananas", "quantity": 1.105, "unit_price": 0.69, "total_price": 0.76 }
  ],
  "subtotal": 81.22,
  "tax": 2.15,
  "total": 83.37,
  "notes": "free-form description of locale / edge cases"
}
```

For the adversarial test, add `ground_truth/adversarial_01.json` with an
`"adversarial": true` flag and the *true* values the model must report despite
injected text printed on the receipt.

## Running locally

```bash
cd backend
GG_LLM_API_KEY=sk-... pytest tests/llm_validation/ -v
```

Targets enforced once data exists (from `13-validation-strategy.md`):
field accuracy ≥90%, hallucination 0%, item recall ≥95%, consistency ≥95%.

## Wiring into CI

Add a job that runs only when the secret is present (so PRs from forks don't fail):

```yaml
  llm-accuracy:
    runs-on: ubuntu-latest
    if: ${{ secrets.GG_LLM_API_KEY != '' }}
    steps:
      - uses: actions/checkout@v4
      - run: pip install -e backend[dev]
      - run: pytest backend/tests/llm_validation/ -v
        env:
          GG_LLM_API_KEY: ${{ secrets.GG_LLM_API_KEY }}
```

Gate merges that touch `app/llm/prompts/**` on this job (a prompt change must
re-run the harness, per CLAUDE.md).
