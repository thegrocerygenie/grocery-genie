# Verification Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every agent working on Grocery Genie, in Claude Code or Codex, two project-local skills that prove its work: `verify-grocery-genie` drives the running backend the way a user does, and `verify-budget-alerts` model-checks the budget alert and push pipeline.

**Architecture:** The four vendored generator skills in `.agents/skills/` (adapted from cursor/plugins pstack `99b609a`) produce the two verify skills. Each skill lives once in `.agents/skills/<name>/`, Codex reads it there, and Claude Code reads a symlink in `.claude/skills/`. `AGENTS.md` is the shared instruction file, and `CLAUDE.md` imports it. `docs/agents/harnesses.md` explains the layout and maps steps between the harnesses.

**Tech Stack:** FastAPI + Postgres (Docker) + Celery for the app; curl/httpx and psql for the behavioral drive; TLA+ with the TLC model checker (needs a JDK) for the formal check; `scripts/check-agent-skills.py` for the skill layout.

## Global Constraints

- Every skill step runs from a shell, so Claude Code and Codex can both follow it. A harness-only tool (the Claude desktop iOS Simulator tool) is an optional extra, named as Claude-only.
- A new skill passes `scripts/check-agent-skills.py` with `0 problems`.
- A verify skill is model-invoked: its `description` names the code or feature that should trigger it.
- Product code is not edited while generating or maintaining a verify skill. A failing property or journey is a finding for the user, not something to patch around.
- Commit gate (from `AGENTS.md`): with the full suite green, ask the user before each commit and again before each push.
- MVP scope only (`docs/prd/PHASE_SCOPE.md`). The verify skills exercise what exists. They build no new features.
- No PHI or secrets in evidence, skills, or commits. Test accounts use generated `@example.com` addresses.

## File map

| Path | Owner | Purpose |
| --- | --- | --- |
| `.agents/skills/gg-{create,maintain}-verification-skill/` | done (this session) | Behavioral generator and its upkeep loop |
| `.agents/skills/gg-{create,maintain}-formal-verification-skill/` | done (this session) | Formal generator and its upkeep loop |
| `.claude/skills/*` | done | Symlinks for Claude Code |
| `docs/agents/harnesses.md`, `docs/agents/LICENSES/pstack-MIT.txt` | done | Harness map, provenance |
| `scripts/check-agent-skills.py` | done | Layout check (proved to fail on 5 planted breaks) |
| `AGENTS.md`, `CLAUDE.md` | done | Shared instructions; Claude-only notes |
| `.agents/skills/verify-grocery-genie/` | Task 3 | Behavioral verify skill + `features/` map + helper scripts |
| `.agents/skills/verify-budget-alerts/` | Task 4 | Formal verify skill |
| `formal/budget_alerts/` | Task 4 | `BudgetAlerts.tla`, `BudgetAlerts.cfg`, `run.sh` |
| `.gitignore` | Tasks 3, 4 | Ignore evidence dirs and the TLC jar cache |

---

### Task 0: Resolve the skill name clash — done 2026-10-26

Claude Code runs a personal skill over a project skill with the same name ([docs](https://code.claude.com/docs/en/skills), "Resolve skills that share a name"). `~/.claude/skills/create-verification-skill` links to the VoiceAI fleet copy, which writes into `~/source/voiceai/fleet`. Codex also reads that copy from `~/.agents/skills/`. The repo generators were therefore renamed with a `gg-` prefix: `gg-create-verification-skill`, `gg-maintain-verification-skill`, `gg-create-formal-verification-skill`, `gg-maintain-formal-verification-skill`. Their Codex display names start with "GG". The rule is in `docs/agents/harnesses.md`, and the fleet repo is unchanged.

- [x] `scripts/check-agent-skills.py`: `5 skills checked, 0 problems`.
- [x] Codex probe (scratch copy, policy flipped to implicit): it listed all four `gg-` skills at their `.agents/skills/` paths.

### Task 1: Prove discovery in both harnesses, then commit the vendoring

**Files:** everything in the file map marked done.

- [x] **Step 1: Claude Code.** Partly proved: once `.claude/skills/` existed, the running session picked up the project symlinks and listed `building-native-ui` (model-invoked, so visible to the model). On 2026-10-26 the Skill tool recognised `gg-create-verification-skill` from the project; it refused it only because it was then hand-run. The four generators were then made model-invoked (frontmatter flag and Codex policy lock dropped, model-facing descriptions written), so an agent runs them itself.
- [ ] **Step 2: Codex.** Already proved: `codex exec` quoted the `AGENTS.md` commit gate verbatim and listed `building-native-ui` from the repo. With the policy flipped to implicit in a scratch copy, it listed all four generators at their `.agents/skills/` paths. In the Codex TUI, type `$gg-create-verification-skill` and confirm the same first paragraph.
- [x] **Step 3:** Run `PATH="$PWD/backend/.venv/bin:$PATH" make validate` (the venv tools are not on PATH). On 2026-10-25 it gave backend `235 passed, 6 skipped`, mobile `98 passed`, all linters clean. That count includes uncommitted receipt-import work from another session. This change touches no product code.
- [x] **Step 4: Commit (ask first).**

```bash
git add AGENTS.md CLAUDE.md .agents/skills .claude/skills docs/agents scripts/check-agent-skills.py .planning/2026-10-25-verification-skills-plan.md
git commit -m "chore(agents): share skills and instructions across Claude Code and Codex; vendor pstack verification generators"
```

### Task 2: Install the verification prerequisites

- [x] **Step 1:** `brew install openjdk@21`. Installed 2026-10-26: `openjdk version "21.0.13.0.2"`. Homebrew keeps it off PATH, so call `/opt/homebrew/opt/openjdk@21/bin/java`.
- [x] **Step 2:** Start Docker. Run `make db-up && make backend-migrate`. Expected: `Postgres healthy.` and Alembic at head.
- [x] **Step 3:** Confirm the backend venv (`backend/.venv`) and `GG_DATABASE_URL` per the "Environment gotchas" in `.planning/HANDOFF-2026-10-25.md`.

### Task 3: Generate `verify-grocery-genie` (behavioral, API surface)

**Run:** `/gg-create-verification-skill` (Claude Code) or `$gg-create-verification-skill` (Codex). The generator interviews the repo itself. These are the facts it should land on. Correct the plan if the code disagrees.

**Interview answers already observed:**
- Surface: the iOS app is primary, but every user journey goes through the FastAPI API, which both harnesses can drive. Start with the API. Mobile UI driving is Task 6.
- Run: `make db-up`, `make backend-migrate`, `uvicorn main:app --host 127.0.0.1 --port <port>` from `backend/`. Ready = `GET /health` answers (no `/api` prefix) **and** a sign-up succeeds (the DB is migrated and writable).
- Why Postgres matters: pytest runs on in-memory SQLite, so this skill is the first automated proof of the Postgres-only behaviour (`ON CONFLICT`, `SKIP LOCKED`, partial indexes). Postgres is on port 54440. The `GG_DATABASE_URL` export is in the handoff's "Environment gotchas".
- Isolate: use its own port (not 8001, the dev server) and its own database (e.g. `gg_verify`, created and migrated by the Launch step) so a verify run never touches the dev data.
- Auth: email/password `POST /api/auth/sign-up` then `POST /api/auth/sign-in` return a token pair (`app/api/routes/auth.py`). Check whether unverified email blocks any journey. If it does, the gap goes in that feature's `Gotchas`.
- Background work: alerts are created inside the confirm request (`ReceiptService.confirm_receipt`, `app/services/receipt_service.py:263`). Push delivery needs Celery (`make backend-worker`, `make backend-beat`) and Expo, so push stays out of the API proof except as `push_status` rows.
- LLM: `POST /api/receipts/scan` needs `GG_LLM_API_KEY` and a receipt image. Without a key, scan is `verified-unreachable` with that prerequisite named. Journeys use `POST /api/receipts` (manual entry) instead.

**Feature map seed (one file each under `features/`):**
1. `manual-receipt.md` — create a manual receipt; `GET /api/dashboard/spending` reflects it; DB row in `receipts`.
2. `budget-alerts.md` — create a budget; manual receipts cross 50/80/100%; `GET /api/notifications` shows exactly one alert per threshold; `budget_alerts_sent` has one row per threshold for the period. A second receipt over the same threshold adds none.
3. `item-correction.md` — `PATCH /api/receipts/{id}` corrects an item's category; the next receipt with the same raw name gets the corrected category (`user_item_mappings`).
4. `delete-restore.md` — soft-delete a receipt; spend drops; `POST /api/receipts/{id}/restore` brings it back.
5. `receipt-scan.md` — scan with a fixture image when a key is present; otherwise `verified-unreachable`.

- [x] **Step 1:** Run the generator through its §1–§3.
- [x] **Step 2:** Its §4 proof: launch, doctor, drive `budget-alerts.md`, capture evidence (request/response bodies plus `psql` counts), clean up. Confirm the evidence survives cleanup at the named location, and that no uvicorn the run started is left (`lsof -i :<port>` is empty).
- [x] **Step 3:** Add the evidence dir to `.gitignore`. Run `scripts/check-agent-skills.py`. Expected: `0 problems`.
- [ ] **Step 4:** Run `make validate`, then commit (ask first): `feat(agents): add verify-grocery-genie behavioral verification skill`.

**Results (2026-10-26):**
- The skill is at `.agents/skills/verify-grocery-genie/`. The helper is `scripts/gg-verify` (launch, doctor, signup, api, scan, sql, cleanup, last). There are five feature files. Evidence goes to `.verification/runs/<run-id>/` (gitignored).
- The proof run `20261026-112148` drove every `budget-alerts` sub-feature from a fresh launch. All passed except `alert-manual`. Cleanup freed port 8011 and dropped `gg_verify`, and the 33 evidence files were kept.
- Corrections the proof forced: the 50% alert is opt-in (`notif_threshold_50` defaults to false), and spend sums line items without tax (`14.77` per mock scan, not `15.95`).
- **Product finding (not fixed):** a manual receipt never triggers budget alerts. `create_manual_receipt` (`backend/app/services/receipt_service.py:607`) saves `status="confirmed"` without dispatching `ReceiptConfirmed` or calling `check_thresholds`, and `mobile/app/manual-entry.tsx` sends no confirming `PATCH`. Proven on Postgres: at 87.3% spend there are no notifications and no `budget_alerts_sent` rows. This breaks BC-03 #1. The fix is a separate, test-first change.
- **Observation for the product owner:** budget spend leaves out tax, because it sums `LineItem.total_price`, not `Receipt.total`. The PRD does not say which is intended.
- Codex: in the default `workspace-write` sandbox, `gg-verify doctor` reports false FAILs (it cannot signal processes, reach localhost, or reach Docker). The skill tells Codex agents to run `$G` outside the sandbox.
- Not yet driven live: `scan-confirm`, `manual-receipt`, `item-correction`, `delete-restore`, and `scan-live` (needs `GG_LLM_API_KEY`). Task 5's maintain pass covers them.


### Task 4: Generate `verify-budget-alerts` (formal, TLA+)

**Run:** `/gg-create-formal-verification-skill` (or `$…` in Codex), naming the budget alert pipeline as the target.

**Code the model must point to:**
- Request transaction: `get_db` commits once at the end of the request (`app/core/dependencies.py:40-47`); default isolation, so READ COMMITTED on Postgres.
- Confirm: `confirm_receipt` sets `status = "confirmed"`, dispatches `ReceiptConfirmed`, runs `check_thresholds`, then for each breach `claim_alert` and `create_notification` (`app/services/receipt_service.py:263-330`).
- Claim: `INSERT … ON CONFLICT DO NOTHING` on `(budget_id, period_start, threshold_percent)` (`app/services/budget_service.py:474-495`; constraint at `app/models/database.py:261-270`).
- Push: `deliver_pending_pushes` expires stale rows, selects pending rows `FOR UPDATE SKIP LOCKED`, calls Expo outside the database, sets `push_status`, commits (`app/tasks/push_tasks.py:40-131`).

**Properties (one plain sentence each):**
- `OneAlertPerThreshold`: each threshold makes at most one notification per budget period.
- `NoMissedAlert`: once all confirms have committed, every threshold the committed spend has reached has an alert.
- `PushAtMostOnce`: Expo is called at most once per notification.
- `EveryPushSettles`: every notification reaches `sent`, `failed`, `no_device`, or `expired`.

**Hypotheses the model must confirm or refute (unconfirmed, from reading the code):**
- H1: two confirms in flight together each read spend without the other's uncommitted receipt, so neither crosses a threshold that their sum crosses. `NoMissedAlert` fails until a later receipt.
- H2: a worker crashes after the Expo call and before its commit. The row lock is released with `push_status` still NULL, and the next beat tick sends again. `PushAtMostOnce` fails.

**Bounds to start:** 1 budget, thresholds {50, 100}, 2 confirm requests, 2 push workers, at most 1 crash.

- [ ] **Step 1:** The generator writes `formal/budget_alerts/` and `run.sh`. `run.sh` downloads a pinned `tla2tools.jar` to `~/.cache/tla/` and checks its sha256. The skill records the version and hash.
- [ ] **Step 2: Able to fail.** For each property, show a failing run on a scratch break: model `claim_alert` without the unique key (expect `OneAlertPerThreshold` to fail), and drop `SKIP LOCKED` from the model (expect `PushAtMostOnce` to fail). Then revert.
- [ ] **Step 3:** Report H1 and H2 as found or refuted, each as a step-by-step trace in the code's words. Leave product code alone. A real finding becomes its own ticket.
- [ ] **Step 4:** The skill records covered files, functions, and the sync commit. Run `scripts/check-agent-skills.py` and `make validate`, then commit (ask first): `feat(agents): add verify-budget-alerts TLA+ verification skill`.

### Task 5: Close the loop

- [ ] **Step 1:** Run `/gg-maintain-verification-skill` once on `verify-grocery-genie`. Expected outcome `clean`, which shows the upkeep loop runs.
- [ ] **Step 2:** Write the next session handoff in `.planning/`. Record the verify skills, how to run them, and the open H1/H2 findings.

### Task 6 (later, ask first): mobile UI drive

There is no mobile E2E harness today. `CLAUDE.md` used to name Detox, but neither Detox nor Maestro is installed. Add Maestro flows (shell, so both harnesses can use them; needs the JDK from Task 2) as a second surface in `verify-grocery-genie`. Then add mapped features for scan → review → confirm and the push-tap deep link.

## Out of scope

- Turning `.claude/commands/*.md` into shared skills. Codex currently reads them as files, per `AGENTS.md`.
- Fixing any H1/H2 finding. Each fix is a separate, test-first change.
