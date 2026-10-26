---
name: verify-grocery-genie
description: "Launch a throwaway Grocery Genie backend on Postgres and drive its API the way the iOS app does (sign up, scan, confirm, budgets, alerts, corrections, delete and restore), capturing evidence. Use after a change to backend routes, services, models, events, or migrations, or to prove a receipt or budget feature works end to end."
---

# Verify Grocery Genie

This skill proves backend behavior through the same HTTP calls the iOS app makes, against real Postgres, with real sign-up and JWT auth. pytest runs on in-memory SQLite with dependencies overridden, so it never exercises Postgres-only behavior (`ON CONFLICT`, `SKIP LOCKED`, partial indexes) or the real dependency wiring. This skill does.

Every step is a shell command, so Claude Code and Codex can both follow it. Run everything from the repo root through one helper:

```bash
G=.agents/skills/verify-grocery-genie/scripts/gg-verify
```

`$G` with no arguments prints its usage. The surface is the API. The iOS UI has no drive harness yet, so a UI-only change needs a manual check on a simulator. Say so when you report.

## Launch

```bash
$G launch              # mock LLM extractor (GG_DEBUG=true); no API key needed
$G launch --live-llm   # real extraction; needs GG_LLM_API_KEY; GG_DEBUG=false
```

Launch runs `make db-up` (it starts the shared dev containers if they are down, and never stops them). It then drops and recreates the `gg_verify` database, migrates it to head, starts `uvicorn main:app` on `127.0.0.1:8011` with a random JWT secret, uploads under `.verification/state/uploads`, and empty email and push keys, so nothing leaves the machine. It waits for `/health`. `/health` never touches the database, so launch then signs up a probe user and reads `/api/users/me`. **Ready** is the `READY http://127.0.0.1:8011  evidence: <dir>` line on stderr, printed only after that probe passes.

Debug mode swaps in `MockReceiptExtractor` and `MockCategoryAssigner` (`backend/app/llm/provider.py`). The LLM is an external boundary, so this is the one mock the proof allows. Debug mode also turns on a static `api_token` auth fallback, wildcard CORS, and skips the production config check. The helper authenticates with real JWTs, so the fallback is never used. Use `--live-llm` when the change touches prompts, extraction, or `production_safety_errors`.

The mock scan always returns the same receipt: `Test Grocery Store`, dated `2026-03-15`, total `15.95`, three items (`Organic Bananas` 1.29, `Whole Milk 1 Gal` 4.99, `Paper Towels 6pk` 8.49). Spend sums line-item totals, so tax is left out and each confirmed mock scan adds `14.77`. Budgets for scan journeys use `period_start` `2026-03-01`, and an `18.33` budget puts one confirmed scan at 80.6%.

Isolation: one instance per checkout. A second `launch` refuses while one runs. To run another checkout at the same time, set `VERIFY_PORT` and `VERIFY_DB` for every command in that checkout. The helper refuses to touch the dev database `grocery_genie`.

## Doctor

```bash
$G doctor
```

This is read-only. It checks that the process is alive, owns its port, answers `/health`, and that `gg_verify` is at the Alembic head. It checks that backend code is unchanged since launch (otherwise you would drive stale code), and that the stored token still authenticates. Run it before the first drive, after any failed drive, and whenever a result surprises you. Any `FAIL` means: fix it, or `cleanup` and `launch` again. Never drive through a `FAIL`.

## Drive

```bash
$G signup [label]                 # new user (example.com); later calls use its token
$G api METHOD PATH [JSON]         # body on stdout, "METHOD PATH -> status" on stderr; exits non-zero on >= 400
$G scan [PHOTO]                   # POST /api/receipts/scan (default: a generated photo); prints the scan response
$G sql "SELECT ..."               # read gg_verify (observe only; never write through it)
```

All routes sit under `/api/` except `/health`. Pipe bodies through `jq`, for example `rid=$($G scan | jq -r .receipt_id)`. Use a fresh `signup` per journey so the users never share state.

The feature map in [`features/README.md`](features/README.md) has one journey per user-facing feature. A proof of a feature drives every sub-feature its file lists, not one convenient entry point.

## Evidence

Each launch gets `.verification/runs/<run-id>/` (gitignored), and `$G last` prints the newest one. It holds:
- `launch.txt` (mode, git head, code fingerprint, migration)
- `server.log`, `migrate.log`, `db-up.log`
- one numbered file per call: `NNN-METHOD-path.json` holding the request, status, and response; `NNN-sql.txt` holding the query and its rows
- `cleanup.txt`

Tokens and passwords are never written. `server.log` can hold the app's dev-only email deep links for the throwaway users, so quote from it and do not paste it whole.

Proof standards:
- Drive the real user path: the routes the iOS app calls, in its order. For scan that is `scan`, then `PATCH /api/receipts/{id}` with `{"status":"confirmed"}`. Never insert rows through `sql` or call internal services.
- Capture the action and the resulting state. Read the change back through the API, and check the side effect in the database (`receipts`, `line_items`, `notifications`, `budget_alerts_sent`, `user_item_mappings`, `receipt_corrections`).
- A journey that fails stays failed. Report the failing step, the expected and actual values, and the evidence file. A behavior the code no longer has is either drift in the feature map or a product bug. Never change the journey to make it pass.
- Report the mode. A debug-mode pass proves everything except real extraction.

## Cleanup

```bash
$G cleanup
```

It stops the uvicorn that `launch` started, and only that one: the pid from its state, checked against the command line. It drops `gg_verify`, deletes `.verification/state/`, and prints where the evidence is kept. The Postgres container keeps running, because the dev setup shares it. Cleanup is idempotent and also clears a crashed run, so run it after every failed attempt and at the end of every session. Then confirm the evidence directory still exists.

## Gotchas

- **Codex sandbox:** inside the default `workspace-write` sandbox, the helper cannot signal processes, reach `127.0.0.1`, or reach the Docker socket. On a healthy instance, `doctor` there reports `process ... is gone`, `/health does not answer ok`, and an empty migration (seen 2026-10-26). Run every `$G` command outside the sandbox: approve escalation for it, or start Codex with `--sandbox danger-full-access`. Never read those sandbox FAILs as app failures.
- **Venv:** the helper uses `backend/.venv/bin/` (Python 3.12). If launch reports the venv missing, set it up as the "Environment gotchas" section of the newest `.planning/HANDOFF-*.md` shows.
- **Free tier:** scans are capped at 20 per user per month (`free_tier_receipts_per_month`). A journey that needs more scans signs up another user.
- **Duplicate warning:** repeated mock scans share store, date, and total, so `duplicate_warning` is `true` from the second scan on. That is expected; confirm still works.
