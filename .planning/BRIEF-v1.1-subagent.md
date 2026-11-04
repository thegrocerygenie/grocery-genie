# Common brief for V1.1 task subagents (Grocery Genie)

You implement ONE V1.1 task in your own git worktree. Read AGENTS.md first and follow it (TDD, validate, verify). Plan: `.planning/PLAN-2026-11-03-v1.1.md` (read the "Definition of done per task" section — you own lines 1–7; the coordinator does line 8 and merges). Gotchas: `.planning/HANDOFF-2026-11-03-v1.1-coordinator.md` ("Gotchas learned").
(The plan files live on origin branch `claude/v11-coordinator`; read them with `git show origin/claude/v11-coordinator:.planning/PLAN-2026-11-03-v1.1.md` if not in your tree.)

## Branch
Cut your branch from `origin/main` (`git fetch origin main && git checkout -b <branch> origin/main`). Never reset or force-push. Commit on your branch and push it with `git push -u origin <branch>` once gates are green. Do NOT open a PR — the coordinator does. Do not touch `.planning/`.

## Environment (already running, shared with other parallel agents — use only YOUR resources listed in the task brief)
- Postgres 16 + pgvector on localhost:54440 (user grocery_genie / grocery_genie_dev, superuser). Redis on localhost:54441.
- Your worktree has no venv/node_modules. Set up: `cd backend && UV_PROJECT_ENVIRONMENT=.venv uv sync --frozen --extra dev` (cache is warm, fast). For mobile: `ln -s /home/user/grocery-genie/mobile/node_modules mobile/node_modules` (or `npm ci` if a change needs new deps; then read the log, don't trust the exit status).
- No Docker daemon: put `<scratchpad>/bin (the coordinator writes the shim from the handoff)` FIRST on PATH for `gg-verify`/`make db-up` (a docker shim).
- Postgres suite: drop+recreate YOUR test DB, then `cd backend && GG_TEST_DATABASE_URL=postgresql+asyncpg://grocery_genie:grocery_genie_dev@localhost:54440/<YOUR_TEST_DB> .venv/bin/pytest -q -p no:randomly`.
  Recreate: `psql -h localhost -p 54440 -U grocery_genie -d postgres -c 'DROP DATABASE IF EXISTS <db> WITH (FORCE)' -c 'CREATE DATABASE <db>'` (PGPASSWORD=grocery_genie_dev).
- alembic check: `GG_DATABASE_URL=postgresql+asyncpg://grocery_genie:grocery_genie_dev@localhost:54440/<YOUR_DEV_DB> .venv/bin/alembic upgrade head && .venv/bin/alembic check` (recreate the DB first).
- verify-grocery-genie: export `VERIFY_DB=<yours> VERIFY_PORT=<yours> VERIFY_REDIS_URL=<yours>` before every `gg-verify` command, so you don't collide with the other agents. Always run `cleanup` at the end.
- Never use the shared DBs `grocery_genie`, `gg_test`, `gg_verify`, or port 8011/8001.

## Definition of done (all must hold before you report PR-ready)
1. TDD: failing test first per AC (show it fail).
2. `/validate` green: backend ruff check, ruff format --check, pytest (SQLite default), `alembic check` on Postgres, `scripts/check-backend-lock.sh`; mobile tsc, eslint, jest.
3. Backend suite green on Postgres with YOUR test DB.
4. `/verify-acceptance <story>`: every AC in scope satisfied and tested; add rows to the V1.1 matrix in `docs/prd/13-validation-strategy.md`; `scripts/check-traceability.py` clean.
5. `/verify-grocery-genie`: drive the feature through the API; add/update a journey in `.agents/skills/verify-grocery-genie/features/` and its README; `scripts/check-agent-skills.py` clean. Quote the run id.
6. Any covered `verify-*` skill named in your task.
7. Docs: `docs/prd/08-api-contracts.md`, `07-data-model.md`, `12-analytics.md` as touched.
Stay in V1.1 scope; no payment code.

## Report (under 300 words)
What changed (files/areas), gate results with counts (pytest SQLite + Postgres, jest, etc.), verify run id(s), branch + head commit pushed, PR-ready yes/no, open questions / anything you could not do.
