---
name: lint-server
description: Audit an MCP server's tool annotations against Palin records and draft fixes. Use when asked to lint, audit or check an MCP server, or to scan servers for the research report.
argument-hint: <local path | GitHub URL | tools.json> [--report-only]
---

# Lint an MCP server

Target: $ARGUMENTS

## Get the tools

Static analysis only: read the server's source or a captured tool list. Never install, build or run the server being checked, and never execute its scripts.

- If `palin lint` exists (`packages/cli` built), run it with `--format json` and use its output.
- Otherwise: clone GitHub URLs into a temp directory (read-only use), then find tool definitions (TypeScript `server.tool(...)`/`registerTool`, Python `@mcp.tool`, or a captured `tools/list` JSON). Record each tool's name, description, input schema and annotations.

## Compare

For each tool, match it to a record using the order in `docs/SPEC.md` ("Tool-to-record matching"). Then:

| Finding | When |
| --- | --- |
| `contradiction` (high) | An unsafe mismatch: `readOnlyHint: true` on R1 to R5, or `destructiveHint: false` on R3 to R5 |
| `missing` (medium) | A state-changing tool lacks `destructiveHint` or `idempotentHint` |
| `overcautious` (low) | Stricter than the record needs, such as `destructiveHint: true` on R0 |
| `unmatched` (low) | No record matches; list it as a coverage gap |
| `ok` | Annotations match |

Only matched records at `documented` or `tested` count as ground truth. Matches to `draft` records are reported as "unconfirmed".

## Output

1. A report at `content/lint/<server-name>.md`: summary counts, a findings table (tool, finding, current annotations, suggested annotations, record id and URL), and coverage gaps.
2. Unless `--report-only`: a patch at `content/lint/<server-name>.patch` that fixes annotations in the server's own code style, plus a short, polite PR description at `content/lint/<server-name>-pr.md` citing the Palin records.
3. Unmatched state-changing tools: offer to run `/add-action` for them.

Never open issues or PRs on the server's repo. The maintainer decides whether to submit.
