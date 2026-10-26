#!/usr/bin/env python3
"""Check that every agent skill loads in both Claude Code and Codex.

Layout (see docs/agents/harnesses.md):
  .agents/skills/<name>/SKILL.md   the skill, read by Codex
  .claude/skills/<name>            relative symlink to it, read by Claude Code
  agents/openai.yaml               Codex policy, required for user-invoked skills

Exits 1 and lists every problem when the layout is wrong. Run from anywhere.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / ".agents" / "skills"
CLAUDE = ROOT / ".claude" / "skills"
LINK = re.compile(r"\]\(([^)\s#]+)(?:#[^)]*)?\)")


def frontmatter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    fields = {}
    for line in text[4:end].splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith((" ", "\t")):
            fields[key.strip()] = value.strip().strip("\"'")
    return fields


def check_skill(skill: Path) -> list[str]:
    name = skill.name
    problems = []
    skill_md = skill / "SKILL.md"
    if not skill_md.is_file():
        return [f"{name}: no SKILL.md"]
    text = skill_md.read_text()
    fields = frontmatter(text)
    if fields is None:
        return [f"{name}: SKILL.md has no YAML frontmatter"]
    if fields.get("name") != name:
        problems.append(f"{name}: frontmatter name is {fields.get('name')!r}")
    if not fields.get("description"):
        problems.append(f"{name}: frontmatter has no description")

    if fields.get("disable-model-invocation") == "true":
        policy = skill / "agents" / "openai.yaml"
        if not policy.is_file() or not re.search(
            r"allow_implicit_invocation:\s*false", policy.read_text()
        ):
            problems.append(
                f"{name}: user-invoked, but agents/openai.yaml does not set "
                "allow_implicit_invocation: false"
            )

    link = CLAUDE / name
    if not link.is_symlink():
        problems.append(f"{name}: .claude/skills/{name} is not a symlink")
    elif link.readlink().as_posix() != f"../../.agents/skills/{name}":
        problems.append(f"{name}: .claude/skills/{name} -> {link.readlink()}")

    for md in skill.rglob("*.md"):
        for target in LINK.findall(md.read_text()):
            if "://" in target:
                continue
            if not (md.parent / target).exists():
                rel = md.relative_to(SKILLS)
                problems.append(f"{name}: {rel} links to missing {target}")
    return problems


def main() -> int:
    problems = []
    skills = sorted(p for p in SKILLS.iterdir() if p.is_dir())
    for skill in skills:
        problems += check_skill(skill)
    names = {s.name for s in skills}
    if CLAUDE.is_dir():
        for entry in sorted(CLAUDE.iterdir()):
            if entry.name not in names:
                problems.append(f".claude/skills/{entry.name}: no matching skill")

    for problem in problems:
        print(f"FAIL {problem}")
    print(f"{len(skills)} skills checked, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
