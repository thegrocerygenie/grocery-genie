#!/usr/bin/env python3
"""Print a subagent's final report from its transcript.

Use when a report never arrived (the container restarted while the agent
finished). Pass the agent's output file (a JSONL transcript, often a symlink).
It prints the agent's hand-back message, or else its last long text reply.
Reading the whole transcript into your context would flood it; this prints
only the report.

Usage: agent-report.py <output-file> [<output-file> ...]
"""

import json
import sys


def last_report(path: str) -> str | None:
    report = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            message = event.get("message") or {}
            content = message.get("content")
            if event.get("type") != "assistant" or not isinstance(content, list):
                continue
            for part in content:
                if part.get("type") == "tool_use" and part.get("name") == "SubagentHandback":
                    report = (part.get("input") or {}).get("message") or report
                elif part.get("type") == "text" and len(part.get("text", "")) > 300:
                    report = part["text"]
    return report


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    for path in sys.argv[1:]:
        print(f"=== {path}")
        try:
            print(last_report(path) or "(no report found)")
        except OSError as exc:
            print(f"(cannot read: {exc})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
