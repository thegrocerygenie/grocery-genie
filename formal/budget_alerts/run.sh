#!/usr/bin/env bash
# Model-check the budget alert and push pipeline with TLC.
# See .agents/skills/verify-budget-alerts/SKILL.md.
#
#   formal/budget_alerts/run.sh             run every *.cfg here; compare each with its EXPECT line
#   formal/budget_alerts/run.sh NAME.cfg    run one config and print TLC's full output
#
# Exit 0 when every result matches its EXPECT line, 1 otherwise.
# TLC logs go to .verification/formal/<run-id>/ (gitignored).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$DIR" rev-parse --show-toplevel)"
TLA_VERSION="1.7.4"
TLA_SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
TLA_URL="https://github.com/tlaplus/tlaplus/releases/download/v$TLA_VERSION/tla2tools.jar"
JAR="${TLA_JAR:-$HOME/.cache/tla/tla2tools-$TLA_VERSION.jar}"

die() { echo "run.sh: $*" >&2; exit 2; }

find_java() {
  local c
  for c in "${JAVA:-}" "${JAVA_HOME:+$JAVA_HOME/bin/java}" /opt/homebrew/opt/openjdk@21/bin/java \
           /usr/local/opt/openjdk@21/bin/java "$(command -v java || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && "$c" -version > /dev/null 2>&1 && { echo "$c"; return; }
  done
  die "no working Java 11+; install one (macOS: brew install openjdk@21) or set JAVA"
}

ensure_jar() {
  if [ ! -f "$JAR" ]; then
    mkdir -p "$(dirname "$JAR")"
    curl -fsSL -o "$JAR.part" "$TLA_URL" && mv "$JAR.part" "$JAR"
  fi
  local got; got="$(shasum -a 256 "$JAR" | cut -d' ' -f1)"
  [ "$got" = "$TLA_SHA256" ] || die "$JAR has sha256 $got, expected $TLA_SHA256 (tla2tools v$TLA_VERSION)"
}

field() { sed -n "s/^\\\\\\* $1: //p" "$2" | head -1; }

# Prints the outcome of one config: "pass", "violation <Name>", "deadlock", or "error".
outcome() {
  local log="$1" cfg="$2"
  if grep -q "Model checking completed. No error has been found." "$log"; then echo "pass"
  elif grep -q "Error: Invariant .* is violated" "$log"; then
    echo "violation $(sed -n 's/^Error: Invariant \(.*\) is violated.*/\1/p' "$log" | head -1)"
  elif grep -q "Error: Temporal properties were violated" "$log"; then
    echo "violation $(sed -nE 's/^PROPERT(Y|IES) +//p' "$cfg" | head -1)"
  elif grep -q "Error: Deadlock reached" "$log"; then echo "deadlock"
  else echo "error"
  fi
}

run_one() {
  local cfg="$1" log="$2"
  local module; module="$(field MODULE "$cfg")"
  [ -n "$module" ] || die "$cfg has no '\\* MODULE:' line"
  local meta; meta="$(mktemp -d)"
  ( cd "$DIR" && "$JAVA_BIN" -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -metadir "$meta" \
      -config "$cfg" "$module.tla" ) > "$log" 2>&1 || true
  rm -rf "$meta"
}

# Warn when code the models describe changed since the skill's sync commit.
sync_check() {
  local skill="$REPO/.agents/skills/verify-budget-alerts/SKILL.md" sync files changed dirty
  sync="$(sed -n 's/^Sync commit: `\([0-9a-f]*\)`.*/\1/p' "$skill")"
  files="$(grep -oE '^\| `backend/[^`]+`' "$skill" | tr -d '|` ')"
  [ -n "$sync" ] && [ -n "$files" ] || die "cannot read the sync commit or coverage table from $skill"
  # shellcheck disable=SC2086
  changed="$(git -C "$REPO" log --oneline "$sync..HEAD" -- $files)"
  # shellcheck disable=SC2086
  dirty="$(git -C "$REPO" status --porcelain -- $files)"
  if [ -z "$changed" ] && [ -z "$dirty" ]; then
    echo "covered code: unchanged since sync commit $sync"
  else
    echo "WARNING covered code changed since sync commit $sync; confirm the models still describe it:"
    [ -n "$changed" ] && echo "$changed" | sed 's/^/  commit /'
    [ -n "$dirty" ] && echo "$dirty" | sed 's/^/  uncommitted /'
  fi
}

JAVA_BIN="$(find_java)"
ensure_jar
sync_check
OUT="$REPO/.verification/formal/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

if [ $# -eq 1 ]; then
  cfg="$DIR/$(basename "$1")"
  [ -f "$cfg" ] || die "no such config: $1"
  log="$OUT/$(basename "$cfg" .cfg).log"
  run_one "$cfg" "$log"
  cat "$log"
  echo "== $(basename "$cfg"): $(outcome "$log" "$cfg") (expected: $(field EXPECT "$cfg")); log: $log"
  exit 0
fi

fail=0
printf '%-30s %-38s %-38s %s\n' CONFIG EXPECTED GOT RESULT
for cfg in "$DIR"/*.cfg; do
  name="$(basename "$cfg" .cfg)"
  log="$OUT/$name.log"
  start=$SECONDS
  run_one "$cfg" "$log"
  got="$(outcome "$log" "$cfg")"
  want="$(field EXPECT "$cfg")"
  if [ "$got" = "$want" ]; then result="ok"; else result="MISMATCH"; fail=1; fi
  printf '%-30s %-38s %-38s %s (%ss)\n' "$name" "$want" "$got" "$result" "$((SECONDS - start))"
done
echo "TLC v$TLA_VERSION; logs: $OUT"
exit "$fail"
