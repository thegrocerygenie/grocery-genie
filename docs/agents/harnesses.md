# Agent harnesses: Claude Code and Codex

Claude Code and Codex both work on this repo. They share one set of instructions and one set of skills. This file says where each lives and how a step written for one harness maps to the other.

## Instructions

`AGENTS.md` is the single source of truth. Codex reads it directly. `CLAUDE.md` imports it with `@AGENTS.md` and adds only what is specific to Claude Code. A rule that both harnesses need goes in `AGENTS.md`.

## Skills

- A skill lives once, in `.agents/skills/<name>/`. Codex reads that folder.
- `.claude/skills/<name>` is a relative symlink to it, which Claude Code reads. Create it from the repo root with `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.
- A user-invoked skill (`disable-model-invocation: true` in its frontmatter) also ships `agents/openai.yaml` with `policy: allow_implicit_invocation: false`. Codex ignores the frontmatter flag and reads only that file.
- A skill adapted from elsewhere gets a `gg-` prefix. Claude Code runs a personal skill (`~/.claude/skills/`) over a project skill with the same name, and Codex also reads personal skills from `~/.agents/skills/`. The prefix keeps the repo copy the one that runs.
- A change to a skill's `disable-model-invocation` flag reaches a running Claude Code session only after a delay of minutes; until then the `Skill` tool still applies the old flag.
- To run a skill by name, type `/<name>` in Claude Code or `$<name>` in Codex.
- Every command a skill relies on runs from a shell, so both harnesses can follow it. A harness-only tool, such as the iOS Simulator tool in the Claude desktop app, is an optional extra, named as Claude-only.
- `scripts/check-agent-skills.py` checks the layout: names, symlinks, and Codex policy files. Run it after you add, rename, or remove a skill.

## Steps that differ by harness

| A skill step says | Claude Code | Codex |
| --- | --- | --- |
| Launch a read-only subagent | `Agent` tool with `subagent_type: "Explore"`. Its brief says "do not edit files". Check `git status` afterward. | Spawn a sub-agent if the session offers one, with the same brief. Otherwise do the reads yourself, one unit at a time. |
| Launch subagents concurrently | Several `Agent` calls in one message. | Parallel sub-agents if the session offers them. Otherwise run the units one after another. The coverage bar stays the same. |
| Ask the user | `AskUserQuestion`. | Ask in plain text. |
| Run another skill | The `Skill` tool, or tell the user to type `/<name>`. | Tell the user to type `$<name>`, or read `.agents/skills/<name>/SKILL.md` and follow it. |

## Upstream

`gg-create-verification-skill`, `gg-maintain-verification-skill`, `gg-create-formal-verification-skill`, and `gg-maintain-formal-verification-skill` are adapted from the pstack plugin in [cursor/plugins](https://github.com/cursor/plugins/tree/99b609a72323b70204eab407c622f436e858e112/pstack/skills) at commit `99b609a` (MIT, see [`LICENSES/pstack-MIT.txt`](LICENSES/pstack-MIT.txt)). The adaptation changes only what is specific to Cursor: output paths, subagent and question steps (they point here), skill names in hand-offs, and shipping one change through this repo's commit gate. The formal skill drops its dependency on pstack's `/statechart` skill. To take a later upstream change, diff upstream from `99b609a` to the new commit and apply the same kind of edits.
