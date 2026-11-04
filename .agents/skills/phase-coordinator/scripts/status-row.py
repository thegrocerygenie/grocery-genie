#!/usr/bin/env python3
"""Set the Status and PR cells of one row in a plan's status table.

Usage: status-row.py <plan.md> <task-id> <status> [<pr-cell>]

Example:
  status-row.py .planning/PLAN-2026-12-01-v1.5.md V15-03 \
    "**done, verified, merged** (review 20261201-101500, verify 20261201-103000)" \
    "branch claude/v15-03"

The row is the one whose first cell is the task id. Columns are
ID | Task | Depends on | Wave | Status | PR. If no row matches, it exits 1
and changes nothing; add new rows by hand.
"""

import sys
from pathlib import Path

STATUS, PR = 5, 6  # cell indexes after splitting on "|" (cell 0 is empty)


def main() -> int:
    if len(sys.argv) not in (4, 5):
        print(__doc__, file=sys.stderr)
        return 2
    path, task_id, status = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    pr = sys.argv[4] if len(sys.argv) == 5 else None
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, line in enumerate(lines):
        cells = line.rstrip("\n").split("|")
        if len(cells) > PR and cells[1].strip() == task_id:
            cells[STATUS] = f" {status} "
            if pr is not None:
                cells[PR] = f" {pr} "
            lines[i] = "|".join(cells) + "\n"
            path.write_text("".join(lines), encoding="utf-8")
            print(lines[i], end="")
            return 0
    print(f"no row for {task_id} in {path}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
