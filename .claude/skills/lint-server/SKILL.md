---
name: lint-server
description: Audit an MCP server's tool annotations against Palin records and draft fixes. Use when asked to lint, audit or check an MCP server.
argument-hint: <local path | GitHub URL | tools.json> [--report-only]
---

# Lint an MCP server

Target: $ARGUMENTS

## Get the tools

Static analysis only: read the server's source or a captured tool list. Never install, build or run the server being checked, and never execute its scripts.

- If `palin lint` exists (`packages/cli` built), run it with `--format json` and use its output.
- For a hosted (remote) server, prefer a captured `tools/list` snapshot over the source, since the deployed tool list can differ from the published code. Use the snapshot you were given or ask the maintainer for one; don't connect to the server yourself. Note in the report when and from where it was captured.
- Otherwise: clone GitHub URLs into a temp directory (read-only use), then find tool definitions (TypeScript `server.tool(...)`/`registerTool`, Python `@mcp.tool`, or a captured `tools/list` JSON). Record each tool's name, description, input schema and annotations.

A hint the tool leaves out counts as its MCP default: `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, `openWorldHint: true`.

## Compare

For each tool, match it to records using the order in `docs/SPEC.md` ("Tool-to-record matching").

- A tool that dispatches on an argument (such as a `method` argument) matches through the alias `match` field. A generic tool that takes any HTTP method and path (such as a `*_api_write`) matches through `operation_from_args`. See `mcp_tool_aliases` in `docs/SCHEMA.md`. Report each matched argument value or operation on its own row.
- Annotations apply to every call of a tool, so judge them against the strictest record the tool can reach, and against each record's top-level fields rather than its `variants` (V20 makes the top level the strictest).

Then classify each tool against the MCP annotation mapping in `docs/SCHEMA.md`:

| Finding | When | What it can mean in clients |
| --- | --- | --- |
| `spec_violation` (high) | The annotation contradicts the MCP spec: `readOnlyHint: true` on R1 to R5, or `destructiveHint: false` on a record with `flags.modifies_existing: true` | Some clients run tools marked `readOnlyHint: true` without asking, and some ask less often for tools marked `destructiveHint: false` |
| `risk_not_expressible` (medium, advisory) | The annotation follows the spec but hides the risk: `destructiveHint: false` on an R3 to R5 record with `flags.modifies_existing: false`, such as sending an email or creating a charge. MCP has no hint for "additive but irreversible". Cite the record and suggest `destructiveHint: true` as the conservative convention | A client that trusts `destructiveHint: false` may run an irreversible send or charge with less friction |
| `overcautious` (low) | Stricter than the record needs, such as `readOnlyHint: false` or `destructiveHint: true` on R0. `destructiveHint: true` on R2 is not overcautious: being undoable alone doesn't justify `false` | More approval prompts than needed, which trains people to approve without reading |
| `unmatched` (low) | No record matches; list it as a coverage gap | Palin can't judge; hosts using Palin treat the tool as unknown (D8, D16) |
| `ok` | Annotations match the mapping | Nothing |

- Read whether an action changes or removes existing data from the record's `flags.modifies_existing`. If the record is a draft without it, say so in the report rather than guess.
- Mismatches the table doesn't cover, such as `idempotentHint: true` on a record with `idempotent: no`, or `openWorldHint: false` (see the open question in `docs/SCHEMA.md`), go in the report's notes, not in the counts.
- Describe client effects in general terms, as in the table. Name a specific client's behaviour only when you can cite its docs.

Only matched records at `documented` or `tested` count as ground truth. Matches to `draft` records are reported as "unconfirmed".

## Output

1. A report at `content/lint/<server-name>.md`: the source (repo and commit, or snapshot and capture date), summary counts, a findings table (tool, matched argument or operation, finding, current annotations, suggested annotations, record id and URL, what it can mean in clients), notes, and coverage gaps.
2. Unless `--report-only` or you only have a snapshot: a patch at `content/lint/<server-name>.patch` that fixes annotations in the server's own code style, plus a short, polite PR description at `content/lint/<server-name>-pr.md` citing the Palin records. The PR text presents `risk_not_expressible` changes as a suggested convention, not a spec fix.
3. Unmatched state-changing tools: offer to run `/add-action` for them.

Never open issues or PRs on the server's repo, or contact its authors. The maintainer decides whether to submit. A public post about a lint result goes through `/write-finding`.
