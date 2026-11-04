# Environment for the coordinator loop

A cloud container has no Docker daemon, no Postgres and no Redis, and it can restart at any time (`uptime` shows a few minutes). `scripts/setup-env.sh` builds all of this and is safe to rerun.

```bash
bash .agents/skills/phase-coordinator/scripts/setup-env.sh <scratchpad> p1 p2 p3 rev
```

It does:

1. `apt-get update` and install `postgresql-16-pgvector` (once).
2. `initdb` in `/var/lib/postgresql/ggdata` (once) and start Postgres 16 on port **54440**, socket in `/tmp`. After a restart it removes a stale `postmaster.pid` and starts again from the same data.
3. Create role `grocery_genie` / `grocery_genie_dev` (superuser) and databases `grocery_genie`, `gg_test`, plus `gg_test_<id>` and `gg_dev_<id>` for each id you pass.
4. Start Redis on **54441** (`--save ""`).
5. Write the docker shim to `<scratchpad>/bin/docker`. `gg-verify` calls `docker exec ... psql` and `make db-up`; the shim sends `psql` to localhost:54440 and answers `compose ps` with `healthy`. Never put it in the repo.
6. `uv sync --frozen --extra dev` in `backend/` and `npm ci` in `mobile/` of the main checkout. Read the npm log: a backgrounded `npm ci` once failed silently.

## Per-agent resources

Parallel agents share Postgres and Redis, so each gets its own names. Give every agent all four, and never the shared `grocery_genie`, `gg_test`, `gg_verify` or ports 8001/8011.

| Agent | Test DB | Dev DB | Verify | Port | Redis DB |
|---|---|---|---|---|---|
| task `<id>` | `gg_test_<id>` | `gg_dev_<id>` | `VERIFY_DB=gg_verify_<id>` | `VERIFY_PORT=80xx` (unique) | `VERIFY_REDIS_URL=redis://localhost:54441/<n>` (unique, 1–15) |
| reviewer | `gg_test_rev` | `gg_dev_rev` | `gg_verify_rev<n>` | unique | unique |

`gg-verify` creates and drops its own verify DB; `cleanup` drops it. Agents recreate their test and dev DBs before each run.

## Commands agents use

- Postgres suite: `cd backend && GG_TEST_DATABASE_URL=postgresql+asyncpg://grocery_genie:grocery_genie_dev@localhost:54440/<test_db> .venv/bin/pytest -q -p no:randomly`
- Migrations: `GG_DATABASE_URL=postgresql+asyncpg://grocery_genie:grocery_genie_dev@localhost:54440/<dev_db> .venv/bin/alembic upgrade head && .venv/bin/alembic check`
- Recreate a DB: `PGPASSWORD=grocery_genie_dev psql -h localhost -p 54440 -U grocery_genie -d postgres -c 'DROP DATABASE IF EXISTS <db> WITH (FORCE)' -c 'CREATE DATABASE <db>'`
- Verify: `PATH=<scratchpad>/bin:$PATH VERIFY_DB=... VERIFY_PORT=... VERIFY_REDIS_URL=... .agents/skills/verify-grocery-genie/scripts/gg-verify ...` as one command. Worktree permission checks refuse `export ... &&` chains and loops around `gg-verify`; agents run single commands with literal values.

## After a restart

1. Rerun `setup-env.sh` with the same ids.
2. Tell every running agent: "the container restarted; Postgres and Redis are back; rerun any step that failed on a connection error."
3. Agents that finished during the restart: their reports may not have reached you. Recover each with `scripts/agent-report.py`.
4. Unpushed commits in agent worktrees survive a worker restart but not a container replacement, so agents push to their task branch as soon as gates pass.
