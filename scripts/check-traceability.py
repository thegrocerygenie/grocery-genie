#!/usr/bin/env python3
"""DoD box 2: check every test the traceability matrix in
docs/prd/13-validation-strategy.md names exists. pytest node ids must collect, and
each jest title appears in its file."""

import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
table = (root / "docs/prd/13-validation-strategy.md").read_text()
py = sorted(set(re.findall(r"`backend/(tests/[^`]+?\.py::[\w:]+)`", table)))
js = re.findall(r"`(mobile/[^`]+?\.test\.tsx?)` \"([^\"]+)\"", table)
out = subprocess.run(
    [str(root / "backend/.venv/bin/pytest"), "--collect-only", "-q", *py],
    cwd=root / "backend",
    capture_output=True,
    text=True,
)
collected = {line.strip() for line in out.stdout.splitlines() if "::" in line}
missing = [n for n in py if not any(c == n or c.startswith(n + "[") for c in collected)]
for f, title in js:
    path = root / f
    if not path.exists() or title not in path.read_text():
        missing.append(f'{f} "{title}"')
print(f"pytest ids: {len(py)}, jest titles: {len(js)}, missing: {len(missing)}")
for m in missing:
    print("  MISSING", m)
sys.exit(1 if missing else 0)
