# Product spec

Palin is an open, tested database of whether AI agent actions on SaaS APIs can be undone, how, for how long, and what escapes before the undo. It ships as a public data repo, a website at palin.dev, an MCP server agents call before acting, a lint tool for MCP server authors, and SDKs.

## Problem

- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are written by each tool's author, and the MCP spec says clients must treat them as untrusted unless the server is trusted.
- Labels are often missing or wrong, and a wrong label is worse than none, because a client that trusts it skips the approval step.
- A yes-or-no destructive flag can't say that an undo only works for 30 days, that a refund keeps the fee, or that a deleted message already notified people.
- Every team building agents re-derives this knowledge one endpoint at a time, from memory.

## Users and jobs

| User | Job | Surface |
| --- | --- | --- |
| An agent (Claude, Codex, Cursor) | "Before I call this tool, can it be undone, and should I ask first?" | MCP server |
| Agent developer | "Which of my agent's tools need approval, and how do I undo mistakes?" | SDK guard, site, cookbook |
| MCP server author | "Are my tool annotations correct?" | `palin lint`, GitHub Action |
| Platform or guardrail vendor | "I need reversibility data for thousands of actions." | API, data license |
| SaaS vendor | "Show agents my API is safe to use." | Vendor verification |

## Principles

1. **Evidence or nothing.** Every factual field cites a doc or a sandbox run. Unknowns are left out and listed as open questions.
2. **Conservative by default.** When unsure, pick the stricter class. An action with no record is treated as R5.
3. **Open data.** The records are public and forkable; freshness, live access and commercial rights are what's sold.
4. **Sandbox only.** Palin never touches live accounts, production tenants or real personal data.
5. **One source of truth.** Every surface reads the same compiled bundle built from the Git repo.
6. **Honest labels.** Confidence and dates are shown on every record, and stale records are downgraded automatically.

## Surfaces

### 1. Data repo (week 1)

YAML records under `data/`, defined in [SCHEMA.md](SCHEMA.md), validated in CI.

### 2. Website, palin.dev (week 5)

| Route | Content |
| --- | --- |
| `/` | Search across all actions |
| `/p/<provider>` | Provider overview: counts by class, sandbox info, last reviewed |
| `/a/<id>` | Action page: class badge, summary, undo, residue, policy, confidence, evidence, history |
| `/classes` | The six classes and the decision guide |
| `/changes` | Weekly feed of changed records |
| `/lint` | How to run `palin lint` |

Every action page has a stable URL, an embeddable badge and structured data for search engines. The site also publishes `/llms.txt`.

### 3. MCP server (week 6)

Package `@palindev/mcp`. Local mode runs over stdio with a bundled snapshot and works offline. Remote mode (month 4, paid) serves fresh data over Streamable HTTP.

| Tool | Input | Output |
| --- | --- | --- |
| `check_action` | Any of: `id`; `server` + `tool`; `provider` + `method` + `path` | `match` (`exact`, `alias`, `operation`, `none`), plus the record summary: class, flags, policy, effective confidence, last verified, undo summary, residue summary, URL. With no match: advice to treat the action as R5 and confirm with the user |
| `undo_plan` | `id` | Whether undo is possible, method, window, operation, steps, caveats |
| `what_leaks` | `id` | Residue items with audience and conditions |
| `classify_tools` | A list of MCP tool definitions | Per tool: matched id, class, current and suggested annotations, mismatches |
| `search_actions` | `query`, optional `provider` | Matching records, most relevant first |

Palin's own tools are all read-only, so they carry `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false` in local mode.

### 4. Undo cookbook (week 7)

For each R2 to R4 record, a tested undo snippet in TypeScript and Python on the action page.

### 5. `palin lint` CLI and GitHub Action (week 8)

```
palin lint <repo-path | github-url | --tools tools.json> [--format text|json|sarif] [--fail-on high|medium|low]
```

| Finding | Severity | Meaning |
| --- | --- | --- |
| `contradiction` | high | An unsafe mismatch: `readOnlyHint: true` on R1 to R5, or `destructiveHint: false` on R3 to R5 |
| `missing` | medium | A state-changing tool lacks `destructiveHint` or `idempotentHint` |
| `overcautious` | low | Annotations are stricter than the record needs (for example, `destructiveHint: true` on R0) |
| `unmatched` | low | No record matches; Palin can't judge |
| `ok` | none | Annotations match the record |

Only records at `documented` or `tested` count as ground truth; matches to drafts are reported as unconfirmed. Lint is static analysis only: it reads tool definitions and never installs or runs the server being checked.

Exit code 0 when nothing reaches `--fail-on`, 1 when something does, 2 on errors. The GitHub Action posts a summary comment and offers a README badge.

### 6. SDKs (months 4 to 6)

`@palindev/sdk` (TypeScript) and `palindev` (Python):

```ts
const decision = guard({ server: "acme/acme-mcp", tool: "send_invoice", args }, { policy });
// => { action: "confirm", record, reason: "R3: emails the customer before any undo" }
```

A policy maps class to action with per-id overrides. Unknown actions are treated as R5, so they get `confirm_strong` (decision D8). Adapters follow for the Claude Agent SDK, OpenAI Agents SDK, Vercel AI SDK and LangGraph.

### 7. Claude Code plugin (months 4 to 6)

The MCP server, a PreToolUse hook that checks MCP calls, and a "check before acting" skill, packaged for Anthropic's plugin directory.

### 8. Paid surfaces (month 3 onward)

Drift alerts, the REST API with an SLA, evidence packs, and vendor verification. Pricing lives in the master plan, not here.

## Tool-to-record matching

Used by `check_action`, `classify_tools`, `palin lint` and the SDK, in this order:

1. Exact alias: `server` and `tool` match an `mcp_tool_aliases` entry.
2. Tool name alone, if exactly one record has that alias.
3. Operation: `provider`, `method` and `path` match `operation` (path templates compared with parameters normalized).
4. Otherwise `none`. Fuzzy matches may be offered as candidates, always labeled unverified, and never used for a policy decision.

## Non-goals

- Executing actions or brokering credentials for users.
- Being a runtime policy engine or firewall; guards and gateways are partners.
- Covering every endpoint of every API. Depth on the most-used, most-dangerous actions beats breadth.
- Testing against live accounts, ever.

## Launch coverage (week 12)

300 records across GitHub, Google (Gmail, Calendar, Drive), Slack, Stripe, AWS (S3, IAM), Notion, Linear and, if a sandbox is available, Microsoft Graph; at least 200 at `tested`.

## Glossary

- **Action:** one vendor API operation, such as `POST /v1/refunds`.
- **Residue:** anything that escapes or is lost before or despite an undo.
- **Effective confidence:** the confidence shown after staleness rules are applied at build time.
- **Drift:** a change in vendor behavior or docs that may invalidate a record.
