# LLM Extraction Validation Harness

This is the accuracy gate for the product's core IP (receipt extraction). It is
**code-complete but data-blocked**: the test logic exists and runs, but it needs
(1) real receipt images paired with ground truth and (2) an LLM API key in CI.

Until both are supplied, every accuracy/consistency/regression test `pytest.skip`s
— so the suite is **green but proves nothing about extraction quality**. Treat
the skips as RED for launch purposes.

## What's still required (cannot be auto-generated)

1. **30+ real receipt photos** under `receipts/<receipt_id>.<ext>` (`.jpg`, `.jpeg`,
   `.png`, `.heic`, `.heif`, or a single-page `.pdf`). Real photos: synthetic images
   don't exercise the vision model meaningfully. HEIC and PDF go through the same
   conversion as `POST /scan` (`app/image/normalize.py`) before the model sees them.
2. **A ground-truth JSON per image** under `ground_truth/<receipt_id>.json` (schema
   below). The file name, the image stem and `receipt_id` must all match.
3. **Every RC-05 language, 3+ receipts each:** English, French, Spanish, German,
   Serbian (Cyrillic) and Mandarin. The id is `<language>_<country>_<NN>`, for
   example `en_us_01`, `en_gb_01` (DD/MM/YYYY), `fr_fr_01`, `es_es_01`,
   `de_de_01` (comma decimal), `sr_rs_01`, `zh_cn_01`. Include at least one
   currency other than USD.
4. **One adversarial receipt**, `adversarial_01`, for the prompt-injection test.
5. **`GG_LLM_API_KEY`** set in the environment, in `backend/.env`, or in the CI secret store.
   The harness reads it through `get_settings()`, as the app does. It is the key for
   `GG_LLM_PROVIDER` (default `anthropic`), because every call goes through LiteLLM.
   With the key in `backend/.env`, a plain `pytest` also runs the live harness once
   fixtures exist, and each run calls the paid API.

Today the set holds one ground-truth file (`ground_truth/en_us_01.json`) and no
images. Run `check` (below) to see exactly what's missing.

## Building the set

From `backend/`:

```bash
# What the set has, per language, and what it still lacks. No API calls.
.venv/bin/python -m tests.llm_validation.run check

# An empty ground-truth file to fill in by hand, then check it.
.venv/bin/python -m tests.llm_validation.run template de_de_01 --currency EUR
```

`check` exits 1 when a file is invalid (a bad date format, a currency that isn't a
3-letter code, no items, an unknown field, an id that doesn't match its file
name), so a typo can't quietly score as a model miss. `--strict` also exits 1
while any coverage gap remains. An offline test runs the same validation on every
commit (`test_harness.py`).

Type every value from the receipt itself, digit for digit. Don't start from the
model's output: a draft from the model anchors the labeller on its mistakes.

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
  "notes": "free-form description of locale / edge cases",
  "adversarial": false
}
```

- `store_name`, `date` and `total` are required keys; use `null` only when the
  receipt doesn't print the value (the model must then answer null too).
- `date` is ISO `YYYY-MM-DD`; `currency` is an ISO 4217 code.
- `quantity` defaults to 1. Numbers use a period decimal, whatever the receipt prints.

## What gets scored

Each receipt is extracted once per session, and every gate test scores the same calls.

- **Field accuracy** (≥90%): store name, date, currency and total, plus quantity,
  unit price and line total for each item paired by name. Numbers match within 2%.
  Currency is scored as the app saves it (prompt v3): the code the model returns, or, for
  null or a symbol that names several currencies (`$`), the user's currency. The set assumes
  a local shopper, so that is the ground truth currency.
- **Hallucination** (0%): extracted items with no paired item on the receipt.
- **Item recall** (≥95%): receipt items the model found.
- **Latency p95** (≤5 s): image conversion plus the model call, nearest-rank p95.
- **Consistency** (≥95%): identical output across 5 runs, confidence scores
  included. Reports also show a data-only rate that ignores confidence, to tell
  unstable scores from unstable reading.
- The regression test requires the baseline in **every language**, not only overall.
- Adversarial receipts stay out of these numbers.

For the adversarial test, add `ground_truth/adversarial_01.json` with an
`"adversarial": true` flag and the *true* values the model must report despite
injected text printed on the receipt.

## Running locally

```bash
cd backend
# The gate, as CI runs it.
GG_LLM_API_KEY=sk-... .venv/bin/pytest tests/llm_validation/ -v

# The full report: per receipt, per language, against every target.
# --runs 5 adds consistency (5x the calls). Exits 1 when a target is missed.
GG_LLM_API_KEY=sk-... .venv/bin/python -m tests.llm_validation.run extract --runs 5

# Priority OCR (PREM-03 AC 6): the same set on the Premium extraction model.
GG_LLM_API_KEY=sk-... GG_LLM_PREMIUM_EXTRACTION_MODEL=<the D9 model> \
  .venv/bin/python -m tests.llm_validation.run extract --premium
```

`extract` saves a JSON report to `reports/<UTC time>_<prompt version>.json`
(`..._premium.json` with `--premium`) with the model, its tier, the mean tokens
per scan (`tokens_per_scan`, for the cost per scan in `docs/DEPLOYMENT.md`
Part 3), the prompt version, every metric and each receipt's misses. Commit the
report with the prompt change it measured: it is the run log `validate-extraction`
asks for. Until `check` shows no gaps, the report says its numbers don't count for
the Definition of Done.

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
