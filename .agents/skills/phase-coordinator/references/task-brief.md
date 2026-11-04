# Common brief for <phase> task subagents (Grocery Genie)

You implement ONE <phase> task in your own git worktree. Read AGENTS.md first and follow it (TDD, validate, verify). The plan is `<plan>` on `main` (read "Definition of done per task"; you own lines 1–7, the coordinator does the rest).

## Branch
Cut your branch from `origin/main` (`git fetch origin main && git checkout -b <branch> origin/main`). Never reset or force-push. Commit on your branch and push it with `timeout 300 git push -u origin <branch>` as soon as the gates are green, even before the final main merge: the container restarts often. Before the final push, `git fetch origin main` and merge it if it moved. Do NOT open a PR. Do not touch `.planning/`.

## Environment (shared with other agents: use only YOUR resources from the task prompt)
- Postgres 16 + pgvector on localhost:54440 (grocery_genie / grocery_genie_dev, superuser). Redis on localhost:54441.
- Your worktree has no venv or node_modules: `cd backend && UV_PROJECT_ENVIRONMENT=.venv uv sync --frozen --extra dev`; `cd mobile && npm ci` (read the log). `npm install <pkg>` skips the patch-package postinstall: run `npx patch-package` after it.
- No Docker daemon: put `<scratchpad>/bin` FIRST on PATH for `gg-verify` and `make db-up`.
- Commands: `.agents/skills/phase-coordinator/references/environment.md` ("Commands agents use").
- Migrations live in `backend/migrations/versions/`. Use only the revision id your task prompt names, with `down_revision` set to main's current head.
- If Postgres or Redis is down, stop and report; the coordinator restarts them.

## Definition of done (all must hold before you report PR-ready)
1. TDD: a failing test first per AC; show it fail.
2. `/validate` green: backend ruff check, ruff format --check, pytest (SQLite), `alembic check` on Postgres, `scripts/check-backend-lock.sh`; mobile tsc, eslint, jest.
3. The backend suite green on Postgres with YOUR test DB.
4. `/verify-acceptance <story>`: every AC in scope satisfied and tested; rows in the <phase> matrix in `docs/prd/13-validation-strategy.md`; `scripts/check-traceability.py` clean.
5. `/verify-grocery-genie`: drive the feature through the API; add or update a journey in `.agents/skills/verify-grocery-genie/features/` and its README; `scripts/check-agent-skills.py` clean. Quote the run id; run `cleanup`.
6. Any `verify-*` skill named in your task. If you change code a formal skill covers, follow `gg-maintain-formal-verification-skill` and report the new sync SHA.
7. Docs: `docs/prd/07-data-model.md`, `08-api-contracts.md`, `12-analytics.md` as touched. Account deletion covers any new table holding user rows (`tests/api/test_account_deletion.py`).
Stay in <phase> scope.

## Permission refusals
The permission check refuses some commands in worktrees: `su`, `git -C <another worktree>`, `export ... && gg-verify` chains, loops and shell functions around `gg-verify`, `$(...)` or `$PATH` inside a gg-verify call, long heredocs, aggregate SQL through `gg-verify sql`, and sometimes your own `git commit` or `git push`. Rerun as single commands with literal values. If an action is refused outright, STOP and report it; never work around a refusal.

## Report (under 300 words)
What changed (files and areas), gate results with counts (pytest SQLite + Postgres, jest, ...), verify run id(s), branch + full head SHA pushed, PR-ready yes/no, open questions and anything you could not do.
