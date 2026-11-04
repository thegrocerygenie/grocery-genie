#!/usr/bin/env bash
# Build or restore the coordinator loop's environment in a cloud container.
# Idempotent: rerun after any container restart.
# Usage: setup-env.sh <scratchpad> [agent-id ...]
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <scratchpad> [agent-id ...]" >&2
  exit 2
fi
SCRATCH=$1; shift
REPO=$(git rev-parse --show-toplevel)
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/var/lib/postgresql/ggdata
PGPORT=54440
REDISPORT=54441

if [ ! -x "$PGBIN/postgres" ] || ! ls /usr/share/postgresql/16/extension/vector.control >/dev/null 2>&1; then
  echo "installing postgresql-16-pgvector"
  apt-get update -qq >/dev/null
  apt-get install -y -qq postgresql-16-pgvector >/dev/null
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "initdb $PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres >/dev/null"
fi

if ! pg_isready -q -h /tmp -p "$PGPORT"; then
  rm -f "$PGDATA/postmaster.pid"
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l /var/lib/postgresql/gg.log start" >/dev/null
  for _ in $(seq 1 30); do pg_isready -q -h /tmp -p "$PGPORT" && break; sleep 1; done
fi
pg_isready -h /tmp -p "$PGPORT"

psql_admin() { psql -h /tmp -p "$PGPORT" -U postgres -qAt "$@"; }
if [ -z "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='grocery_genie'")" ]; then
  psql_admin -c "CREATE USER grocery_genie PASSWORD 'grocery_genie_dev' SUPERUSER"
fi
create_db() {
  if [ -z "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='$1'")" ]; then
    psql_admin -c "CREATE DATABASE $1 OWNER grocery_genie"
    echo "created database $1"
  fi
}
create_db grocery_genie
create_db gg_test
for id in "$@"; do
  create_db "gg_test_$id"
  create_db "gg_dev_$id"
done

if ! redis-cli -p "$REDISPORT" ping >/dev/null 2>&1; then
  redis-server --port "$REDISPORT" --daemonize yes --save "" >/dev/null
  sleep 1
fi
echo "redis: $(redis-cli -p "$REDISPORT" ping)"

mkdir -p "$SCRATCH/bin"
cat > "$SCRATCH/bin/docker" <<'SHIM'
#!/bin/sh
case "$1" in
  compose) for a in "$@"; do [ "$a" = "ps" ] && { echo healthy; exit 0; }; done; exit 0 ;;
  exec) shift; [ "$1" = "-i" ] && shift; shift
        if [ "$1" = "psql" ]; then shift; PGPASSWORD=grocery_genie_dev exec psql -h localhost -p 54440 "$@"; fi; exit 0 ;;
esac
exit 0
SHIM
chmod +x "$SCRATCH/bin/docker"
echo "docker shim: $SCRATCH/bin/docker"

if [ ! -x "$REPO/backend/.venv/bin/pytest" ]; then
  (cd "$REPO/backend" && UV_PROJECT_ENVIRONMENT=.venv uv sync --frozen --extra dev >"$SCRATCH/uv.log" 2>&1) \
    || { echo "uv sync failed, see $SCRATCH/uv.log" >&2; exit 1; }
fi
if [ ! -x "$REPO/mobile/node_modules/.bin/jest" ]; then
  (cd "$REPO/mobile" && npm ci >"$SCRATCH/npm.log" 2>&1) \
    || { echo "npm ci failed, see $SCRATCH/npm.log" >&2; exit 1; }
fi

grep -qxF ".claude/worktrees/" "$REPO/.git/info/exclude" 2>/dev/null \
  || echo ".claude/worktrees/" >> "$REPO/.git/info/exclude"
echo "environment ready"
