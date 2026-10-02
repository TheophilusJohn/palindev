# @palindev/core

Loads Palin records, compiles the bundle every surface reads, and matches tool calls to records. Surfaces (the Claude Code hook first) never read YAML directly; they go through this package (docs/ARCHITECTURE.md).

**Status: a stub.** There is no code yet.

- **Week 3:** a minimal lookup, enough for the rough PreToolUse hook on `mcp__github__*` and Bash `gh` and `aws` commands.
- **Week 4:** the full package, built on `@palindev/schema`:
  - `loadRepo`: reads and validates a data root.
  - `compileBundle`: `effective_confidence` (`tested_stale` 90 days after the newest passing run), drafts left out unless `--include-drafts`, and the alias, CLI and operation indexes. Run it with `pnpm build:bundle`.
  - `effectiveConfidence`.
  - `matchTool`: MCP aliases with `match` and `operation_from_args`, CLI aliases, operations, and the strictest applicable variant. Matching follows the order in docs/SPEC.md, "Tool-to-record matching".
  - `minPolicy`.

Nothing here ever reports an action without a record as safe (D8, D16).
