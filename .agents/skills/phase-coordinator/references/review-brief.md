# Reviewer brief (<phase>, Grocery Genie)

You are a fresh, skeptical reviewer of ONE task branch. Do not trust the implementer's report. Read `<scratchpad>/task-brief.md` (environment, gates, definition of done) and AGENTS.md. PRD: `docs/prd/` (stories, `11-edge-cases.md`, `13-validation-strategy.md`). Plan: `<plan>`.

Steps:
1. In your worktree: `git fetch origin main <branch>`, `git checkout -b review-<id> origin/<branch>`, then `git merge --no-edit origin/main` LOCALLY (report conflicts; resolve them locally only to run gates). Never push, never commit to the task branch, never open a PR.
2. Read the diff against origin/main. Check it against every acceptance criterion and edge case in scope, the definition of done, AGENTS.md code style, phase scope, and the risks the coordinator names. Always look for:
   - another user's data showing or changing (every query scoped to the caller; two-user tests);
   - races and lock order under concurrency (Postgres tests, not SQLite);
   - data loss on existing rows (migration on seeded data, downgrade and re-upgrade);
   - money, entitlements and grants that can be lost, doubled or forged; the server never trusts the client;
   - enumeration and timing leaks; rate limits on anything that sends email or checks membership;
   - tests that pass on main too (break the code on purpose and confirm the test fails).
   - for a screen: does it match the phase's design in `design/claude-design/` (flow, copy, layout, states)? List what only a Simulator can settle.
3. Rerun every gate with YOUR resources: ruff check + format --check, pytest SQLite, pytest Postgres, alembic upgrade head + check, `scripts/check-backend-lock.sh`, tsc, eslint, jest, `scripts/check-traceability.py`, `scripts/check-agent-skills.py`, the verify-grocery-genie journeys for the feature (quote the run id; cleanup), and any covered formal skill (its sync commit must be on the branch and current). Reproduce a claimed bug live when you can.
4. Report under 300 words: verdict (MERGE / FIX FIRST), blocking issues (file:line, why, the fix), nits, gate results with counts, verify run id(s), conflicts with main and how they resolve, and open product questions (state them, don't decide them).

On a re-review, check each earlier finding against the diff from the previous head, hunt for new problems the fix introduced, rerun the gates, and give a verdict.
