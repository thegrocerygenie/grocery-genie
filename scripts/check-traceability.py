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
if py and not collected:
    sys.exit(
        f"pytest collected nothing; is the backend set up?\n{out.stdout[-2000:]}{out.stderr[-2000:]}"
    )
missing = [n for n in py if not any(c == n or c.startswith(n + "[") for c in collected)]
for f, title in js:
    path = root / f
    if not path.exists() or title not in path.read_text():
        missing.append(f'{f} "{title}"')
print(f"pytest ids: {len(py)}, jest titles: {len(js)}, missing: {len(missing)}")
for m in missing:
    print("  MISSING", m)
sys.exit(1 if missing else 0)
