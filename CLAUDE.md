@AGENTS.md

## Claude Code only

`AGENTS.md` above is the shared source of truth for Claude Code and Codex. Put a rule both need there; this section holds only what Claude Code alone has.

- **Hooks** (`.claude/settings.json`): after each edit to a backend `.py` file, `ruff check` runs; after each edit to a mobile `.ts`/`.tsx` file, `tsc --noEmit` runs. They report and never block, and nothing runs when you stop, so run `/validate` and `/done` yourself before you report done.
- **iOS Simulator tool** (desktop app): use it to see the app. Verification steps run from a shell so Codex can follow them too; the tool is an extra on top.
