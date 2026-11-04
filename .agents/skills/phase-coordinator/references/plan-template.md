# Plan: <phase> (<theme>), <date>

Source of scope: `[<phase>]` tags in `docs/prd/`, `docs/prd/PHASE_SCOPE.md`. Coordinator protocol: `.agents/skills/phase-coordinator/SKILL.md`.

## Status

Update this table in each task's own PR: the coordinator's only durable memory.

| ID | Task | Depends on | Wave | Status | PR |
|---|---|---|---|---|---|
| <P>-00 | Phase docs: PHASE_SCOPE.md + AGENTS.md "Current Build Phase" → <phase> | — | 0 | todo | |
| <P>-01 | <story id + one line> | — | 1 | todo | |

Status values: `todo`, `in progress (branch ..., migration ...)`, `**done, verified, merged** (review/verify run ids; manual checks pending)`, `**dropped** (who, why)`.

## Decisions (answered by the user, <date>)

- **D1 <topic>:** <the user's answer, and what it rules in and out>.

## Open questions

<Questions waiting on the user. Never build past one.>

## Task specs (what each subagent gets)

**<P>-01 <name>.** Stories and ACs: <ids, file paths>. Edge cases: <ids>. Contracts: <08-api-contracts sections, frozen before mobile work starts>. Migration: `<YYYYMMDD>_<NNNN>` or none. Design screens: <`design/claude-design/` file and component, or none>. Covered verify skills: <verify-budget-alerts, ...>. Risks for the reviewer: <security, concurrency, data loss ...>.

## Parallelism and conflict rules

- Waves: <which tasks run at once>.
- Shared files: `backend/app/models/schemas.py`, `backend/main.py`, `backend/app/core/config.py`, `backend/app/core/entitlements.py`, `mobile/app/_layout.tsx`, the matrix in `docs/prd/13-validation-strategy.md`. Merge one PR at a time; the next branch merges main and reruns its gates.
- Migrations: one per task, ids fixed above in merge order, never two open at once.
- Mobile: one agent per screen file at a time.

## Definition of done per task (the coordinator checks every line)

1. TDD: a failing test first for each acceptance criterion.
2. `/validate` green (ruff check, ruff format --check, pytest, `alembic check` on Postgres, `scripts/check-backend-lock.sh`; tsc, eslint, jest).
3. The backend suite on Postgres, not only SQLite.
4. `/verify-acceptance <story>`: every AC satisfied and tested; matrix rows; `scripts/check-traceability.py` clean.
5. `/verify-grocery-genie`: a new or updated journey; `scripts/check-agent-skills.py` clean; run id quoted.
6. Any covered `verify-*` skill; a moved sync commit means a merge commit, not a squash.
7. Docs: 07, 08, 12 as touched; account deletion covers new tables.
8. A fresh reviewer's MERGE.
9. The user's OK, then the coordinator commits the status row, opens the PR and merges.

UI-only behavior can't be proved by `verify-grocery-genie` (API only): list it for a Simulator check.

## Phase done

Every row merged or dropped; the <phase> Definition of Done in `docs/prd/13-validation-strategy.md` has every automated box PASS on `main` (final `/validate`, every verify journey, every formal skill current); the user has the MANUAL list.
