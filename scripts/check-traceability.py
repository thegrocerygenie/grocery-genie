#!/usr/bin/env python3
"""DoD box 2: check every test the traceability matrix in
docs/prd/13-validation-strategy.md names exists. pytest node ids must collect, and
each jest title appears in its file."""

import re
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
table = (root / "docs/prd/13-validation-strategy.md").read_text()
py = sorted(set(re.findall(r"`backend/(tests/[^`]+?\.py::[\w:]+)`", table)))
js = re.findall(r"`(mobile/[^`]+?\.test\.tsx?)` \"([^\"]+)\"", table)
# backend/.venv on a set-up checkout; otherwise the pytest on PATH.
venv_pytest = root / "backend/.venv/bin/pytest"
pytest = str(venv_pytest) if venv_pytest.exists() else shutil.which("pytest")
if pytest is None:
    sys.exit(
        "No pytest: neither backend/.venv/bin/pytest nor pytest on PATH.\n"
        "Set up the backend first: make install-backend."
    )
out = subprocess.run(
    [pytest, "--collect-only", "-q", *py],
    check=False,
    cwd=root / "backend",
    capture_output=True,
    text=True,
)
collected = {line.strip() for line in out.stdout.splitlines() if "::" in line}
# Exit 5 is a true empty collection (no tests at all), usually a backend that
# isn't set up. Any other failure is a collection error: a bad file path or an
# import error stops pytest before it lists anything, so say what pytest said
# and still check the jest titles.
if py and not collected and out.returncode == 5:
    sys.exit(
        "pytest collected nothing; is the backend set up?\n"
        f"{out.stdout[-2000:]}{out.stderr[-2000:]}"
    )
errors = [
    line
    for line in (out.stdout + out.stderr).splitlines()
    if line.startswith(("ERROR", "E   ")) or "error during collection" in line
]
if out.returncode not in (0, 5):
    print(f"pytest --collect-only failed (exit {out.returncode}):")
    for line in errors or (out.stdout + out.stderr).splitlines()[-20:]:
        print("  " + line)
# When pytest listed nothing, every id would show as missing; the error above
# names the one to fix.
collect_failed = bool(py) and not collected
missing = [
    n
    for n in ([] if collect_failed else py)
    if not any(c == n or c.startswith(n + "[") for c in collected)
]
for f, title in js:
    path = root / f
    if not path.exists() or title not in path.read_text():
        missing.append(f'{f} "{title}"')
print(f"pytest ids: {len(py)}, jest titles: {len(js)}, missing: {len(missing)}")
for m in missing:
    print("  MISSING", m)
if collect_failed:
    print("pytest ids not checked: fix the collection error above and rerun.")
sys.exit(1 if missing or collect_failed else 0)
