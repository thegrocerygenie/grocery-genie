#!/bin/sh
# Checks that .githooks reinstall dependencies when a pull or branch switch
# changes a dependency file. Builds a scratch repo from this repo's .githooks
# and Makefile, with stub npm and uv that log each install, so it runs in
# seconds and touches nothing here. Exits 1 and names each failed check.
#
# Main case: a branch switch that drops a package, then a fast-forward that
# brings it back, both inside one second. The second install must still run;
# make compares whole-second mtimes, so a stamp-based skip would miss it.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-githooks.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
LOG=$TMP/installs.log
REPO=$TMP/repo
FAIL=0

# Stubs: npm "installs" by copying the lockfile to its stamp, as npm does.
mkdir -p "$TMP/bin"
cat >"$TMP/bin/npm" <<EOF
#!/bin/sh
echo npm >>"$LOG"
mkdir -p node_modules && cp package-lock.json node_modules/.package-lock.json
EOF
cat >"$TMP/bin/uv" <<EOF
#!/bin/sh
echo uv >>"$LOG"
EOF
chmod +x "$TMP/bin/npm" "$TMP/bin/uv"
PATH=$TMP/bin:$PATH
export PATH

fail() { echo "FAIL: $1"; FAIL=1; }
pass() { echo "ok:   $1"; }
installs() { if [ -f "$LOG" ]; then tr '\n' ' ' <"$LOG" | sed 's/ $//'; fi; }
deps() { # $1 = lockfile version
  printf '{"name":"m","dependencies":{%s}}\n' "$2" >mobile/package.json
  printf '{"lockfileVersion":3,"v":"%s"}\n' "$1" >mobile/package-lock.json
}
commit() { git add -A && git commit -qm "$1"; }
# Start at the top of a second, so the next steps share it.
top_of_second() { python3 -c 'import time; time.sleep(1.02 - time.time() % 1)'; }
mobile_current() { cmp -s "$REPO/mobile/package-lock.json" "$REPO/mobile/node_modules/.package-lock.json"; }

git init -q -b main "$REPO"
cd "$REPO"
git config user.email check@example.com
git config user.name check-githooks
cp -R "$ROOT/.githooks" "$ROOT/Makefile" .
printf 'node_modules/\n.venv/\n' >.gitignore
mkdir -p mobile backend/.venv/bin
printf '#!/bin/sh\nexit 0\n' >backend/.venv/bin/python
chmod +x backend/.venv/bin/python
printf '[project]\nname = "b"\n' >backend/pyproject.toml
deps old '"expo":"1"'
commit "base"
git switch -qc feat
deps new '"expo":"1","expo-localization":"1"'
commit "feat: add expo-localization"
git switch -q main
git switch -qc upstream
deps new '"expo":"1","expo-localization":"1"'
commit "upstream: add expo-localization"
echo docs >README.md
commit "upstream: docs only"
printf '[project]\nname = "b"\nversion = "2"\n' >backend/pyproject.toml
commit "upstream: backend dep"
git switch -q feat
make -s install >/dev/null
mobile_current || { echo "setup: stub install did not run"; exit 1; }

# 1. Switch drops the package, fast-forward brings it back, in one second.
for i in 1 2 3; do
  git switch -q feat
  git branch -f main upstream~3
  make -s install >/dev/null
  rm -f "$LOG"
  top_of_second
  git switch -q main >/dev/null 2>&1
  git merge -q --ff-only upstream~2 >/dev/null 2>&1
  if mobile_current; then
    pass "switch then fast-forward in one second, run $i (installs: $(installs))"
  else
    fail "switch then fast-forward in one second, run $i: node_modules is stale (installs: $(installs))"
  fi
done

# 2. A move with no dependency change installs nothing, quickly.
git switch -q --detach upstream~2
rm -f "$LOG"
start=$(python3 -c 'import time; print(time.time())')
git switch -q --detach upstream~1
took=$(python3 -c "import time; print(f'{time.time() - $start:.2f}')")
if [ -z "$(installs)" ]; then
  pass "docs-only switch installs nothing (${took}s)"
else
  fail "docs-only switch ran installs: $(installs)"
fi

# 3. A backend-only change installs the backend, not mobile.
rm -f "$LOG"
git switch -q --detach upstream >/dev/null 2>&1
if [ "$(installs)" = uv ]; then
  pass "backend-only switch installs the backend only"
else
  fail "backend-only switch: want installs 'uv', got '$(installs)'"
fi

# 4. A file checkout (git checkout -- file) installs nothing.
rm -f "$LOG"
git checkout -q upstream~3 -- mobile/package.json
git checkout -q HEAD -- mobile/package.json
if [ -z "$(installs)" ]; then
  pass "file checkout installs nothing"
else
  fail "file checkout ran installs: $(installs)"
fi

exit $FAIL
