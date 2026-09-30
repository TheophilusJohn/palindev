# Product spec

Palin is an open, tested database of whether AI agent actions on SaaS APIs can be undone, how, for how long, and what escapes before the undo. It ships first as a public data repo, a Claude Code hook that checks actions before they run, and a website at palin.dev. An MCP server, a lint tool for MCP server authors and SDKs come after launch, when a named partner asks for them (D17).

## Problem

- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are written by each tool's author, and the MCP spec says clients must treat them as untrusted unless the server is trusted.
- Labels can be missing or wrong, and a wrong label is worse than none, because a client that trusts it skips the approval step. On popular vendor servers outright errors are rare (D17); the larger gap is what a label can't express.
- A yes-or-no destructive flag can't say that an undo only works for 30 days, that a refund keeps the fee, or that a deleted message already notified people.
- Annotations are per tool, but one tool can be safe or irreversible depending on its arguments. Many agent incidents run through a shell (`gh`, `aws`), where there are no annotations at all (D12, D18).
- Every team building agents re-derives this knowledge one endpoint at a time, from memory.

## Users and jobs

| User | Job | Surface |
| --- | --- | --- |
| Claude Code user | "Ask me before my agent runs something that can't be undone, and tell me what escapes." | Claude Code hook |
| An agent (Claude, Codex, Cursor) | "Before I call this tool, can it be undone, and should I ask first?" | MCP server (after launch) |
| Agent developer | "Which of my agent's tools need approval, and how do I undo mistakes?" | Site, hook; SDK guard and cookbook after launch |
| MCP server author | "Are my tool annotations correct?" | `palin lint`, GitHub Action (after launch) |
| Platform or guardrail vendor | "I need reversibility data for thousands of actions." | Open bundle, commercial data feed |
| Recovery or backup vendor | "Which agent actions can a snapshot restore actually undo?" | Records and redacted traces, commercial data feed |
| Auditor or insurer | "Which agent actions need human approval, and what's the evidence?" | Records with evidence, redacted traces, dated snapshots |
| SaaS vendor | "Have my API's actions tested independently and kept current." | Vendor-paid verification, disclosed on each record |

## Principles

1. **Evidence or nothing.** Every factual field cites a doc or a sandbox run. Unknowns are left out and listed as open questions.
2. **Conservative by default.** When unsure, pick the stricter class. Every surface treats an action with no record as R5 (D8), except the Claude Code hook: it gives no decision and says that no Palin record exists and the action should be treated as irreversible; its strict mode asks instead (D16). Nothing ever reports an unknown action as safe.
3. **Independent.** Records say what actions actually do, whoever pays. Vendor-paid work is disclosed on each record it touches and can't change results (D11).
4. **Open data.** Records are CC BY 4.0, with quotes from vendor docs excluded from the grant; code is Apache-2.0. What's sold is freshness, SLAs, dated snapshots, catalog mapping and support, not permission (D15).
5. **Sandbox only.** Palin never touches live accounts, production tenants or real personal data. For AWS, the sandbox is a dedicated, locked-down account (D14).
6. **Within the terms.** A provider's records reach `tested`, or appear in a finding that contradicts its docs, only when its terms are rated green or written consent is on file. Such a finding goes to the vendor first with a 14-day right of reply, security issues go through the vendor's disclosure program, and raw vendor payloads are never published (D13).
7. **One source of truth.** Every surface reads the same compiled bundle built from the Git repo.
8. **Honest labels.** Every record shows its confidence and dates, and every residue item says whether a probe saw it or it comes from docs. Tested records compile as `tested_stale` 90 days after their newest passing run.

## Surfaces

Timing follows [ROADMAP.md](ROADMAP.md). Sections 1 to 3 ship by launch. Sections 4 to 7 wait for the named external signal in its "After launch" table (D17).

### 1. Data repo (week 1)

YAML records under `data/`, defined in [SCHEMA.md](SCHEMA.md), validated in CI, and licensed CC BY 4.0.

### 2. Claude Code hook (rough demo week 3; plugin weeks 5 to 8)

A PreToolUse hook that checks each call against the bundle before Claude Code runs it. It is the one enforcement surface built first (D17): a hook `ask` still reaches a person in Claude Code auto mode, whose classifier never sees MCP tool results.

- **Week 3:** a rough hook on `mcp__github__*` and Bash `gh` and `aws` commands, plus a two-minute demo.
- **Weeks 5 to 8:** packaged as a Claude Code plugin with `mcp__*` and Bash matchers and a strict mode.

It matches `mcp__<server>__<tool>` calls against `mcp_tool_aliases` and Bash commands against `cli_aliases`, as in [Tool-to-record matching](#tool-to-record-matching). `<server>` is the name the user gave the server in their config, not its repo name; when the hook can't tell which server that is, the match is on tool name alone.

| Result | Hook answer |
| --- | --- |
| Policy `allow` or `allow_and_log` | No decision; Claude Code's own permission rules apply |
| Policy `confirm` or `confirm_strong` | `ask` |
| Policy `block` | `deny` |
| No record | No decision, plus context saying no Palin record exists and the action should be treated as irreversible. Strict mode answers `ask` (D16) |

The reason on `ask` and `deny` carries the record's `approval_text`, residue, undo plan, effective confidence, last verified date and URL. The hook never answers `allow` (D17), so it can add a prompt or block a call but never skip a prompt Claude Code would otherwise show.

The check runs locally against a bundled snapshot. The plugin fetches a fresh bundle from palin.dev once a week. A fetched bundle is used only after its signature verifies; otherwise the hook keeps the last good bundle. The hook has no telemetry code, and the fetch count is the only retention signal. Every bundle carries an expiry date, and expiry never removes a prompt (D24). Past it, the hook keeps answering `ask` or `deny` from its last records, with a reason that says the data has expired; only actions those records don't cover get the unknown handling above.

### 3. Website, palin.dev (weeks 9 to 12)

A static Astro site built from the bundle.

| Route | Content |
| --- | --- |
| `/` | Search across all actions |
| `/p/<provider>` | Provider overview: counts by class, sandbox info, terms status, last reviewed |
| `/a/<id>` | Action page: class badge, summary, variants, undo, residue with provenance, approval text, policy, confidence, evidence, history |
| `/runs/<run_id>` | A published redacted trace for a tested record, with its SHA-256 |
| `/incidents/<slug>` | A real agent incident and what the record would have said |
| `/classes` | The six classes and the decision guide |

Each residue item shows its `observed_by`. A tested record shows "Observed in <sandbox> on <date>", with the count of residue items a probe or proxy saw; a `tested_stale` record shows its last observed date prominently. Vendor-paid verification is disclosed on the record (D11). Traces are the redacted traces from `runs/`, never raw vendor payloads (D13).

Every action page has a stable URL and structured data for search engines. The site also publishes `/llms.txt`.

### 4. MCP server (after launch)

Package `@palindev/mcp`. It runs over stdio with a bundled snapshot and works offline. It waits until a named partner asks (D17), and there is no hosted remote mode for now (D19). Once its bundle has expired it treats every action as unknown (R5), because it can give permissive answers (D24).

Claude Code's auto-mode classifier never sees MCP tool results, which is why the hook comes first there (D17).

| Tool | Input | Output |
| --- | --- | --- |
| `check_action` | Any of: `id`; `server` + `tool`, with optional `args`; `provider` + `path`, plus `method` for HTTP and `service` where the record sets one (every AWS record); `command` (a CLI line) | `match` (`exact`, `alias`, `tool_name`, `operation`, `cli`, `none`), plus the record summary after variants: class, flags, policy, approval text, effective confidence, last verified, undo summary, residue summary, URL. With no match: advice to treat the action as R5 and confirm with the user |
| `undo_plan` | `id` | Whether undo is possible, method, window, operation, steps, values to capture (response fields, and prior values read before the call), caveats |
| `what_leaks` | `id` | Residue items with audience, conditions and `observed_by` |
| `classify_tools` | A list of MCP tool definitions | Per tool: matched id, class, current and suggested annotations, lint finding |
| `search_actions` | `query`, optional `provider` | Matching records, most relevant first |

Palin's own tools are all read-only, so they carry `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`, since they read only the bundled snapshot.

### 5. `palin lint` CLI and GitHub Action (after launch)

```
palin lint <repo-path | github-url | --tools tools.json> [--format text|json|sarif] [--fail-on high|medium|low]
```

For a hosted server, lint prefers a captured `tools/list` snapshot passed with `--tools`, because the deployed tools can differ from the source repo. Findings follow SCHEMA's [annotation mapping](SCHEMA.md#mcp-annotation-mapping); absent hints are compared at the MCP spec's defaults.

| Finding | Severity | Meaning |
| --- | --- | --- |
| `spec_violation` | high | The annotation contradicts the MCP spec: `readOnlyHint: true` on R1 to R5, or `destructiveHint: false` on an action whose record shows it changes or removes existing data |
| `risk_not_expressible` | medium | Advisory. The annotation follows the spec but hides the risk, such as `destructiveHint: false` on an additive R3 to R5 action (sending an email, creating a charge). Cites the record and suggests `destructiveHint: true` as the conservative convention |
| `overcautious` | low | Annotations are stricter than the record needs (for example, `destructiveHint: true` on R0). `destructiveHint: true` on R2 is not overcautious |
| `unmatched` | low | No record matches; Palin can't judge |
| `ok` | none | Annotations match the record |

Only records at `documented` or `tested` count as ground truth; matches to drafts are reported as unconfirmed. Lint is static analysis only: it reads tool definitions and never installs or runs the server being checked.

Exit code 0 when nothing reaches `--fail-on`, 1 when something does, 2 on errors. The GitHub Action posts a summary comment and offers a README badge.

### 6. Undo cookbook (after launch)

For each R2 to R4 record, a tested undo snippet in TypeScript and Python on the action page, including the response fields to save and any prior values to read before the call (`undo.capture`).

### 7. SDKs (after launch)

`@palindev/sdk` (TypeScript) and `palindev` (Python):

```ts
const decision = guard({ server: "acme/acme-mcp", tool: "send_invoice", args }, { policy });
// => { action: "confirm", record, reason: "R3: emails the customer before any undo" }
```

A policy maps class to action with per-id overrides. Unknown actions are treated as R5, so they get `confirm_strong` (decision D8). Once its bundle has expired it treats every action as unknown (R5), as the MCP server does (D24). Adapters for the Claude Agent SDK, OpenAI Agents SDK, Vercel AI SDK and LangGraph, and exporters for other hosts (Codex, Cursor, Gemini CLI, OpenClaw), follow when a named partner asks.

### 8. Paid offers

Direct B2B offers only: a fixed-fee catalog audit, a commercial data feed and vendor-paid verification. No self-serve tiers, hosted API or billing build for now (D19). Vendor-paid verification is disclosed on each record and can't change results (D11). Offers and prices live in `private/PLAN.md` (D21), not here.

## Tool-to-record matching

Used by the hook, `check_action`, `classify_tools`, `palin lint` and the SDK, in this order:

1. Exact alias: `server` and `tool` match an `mcp_tool_aliases` entry. An alias with `match` applies only when the call's arguments satisfy it; an alias with `operation_from_args` reads the method and path from the named arguments and matches them to `operation` as in step 3.
2. Tool name alone: the server is unknown or unlisted, but exactly one record has an alias for that tool name that fits the arguments, applied as in step 1.
3. Operation: `provider`, `service` (where the record sets one, as every AWS record does), `method` (HTTP only) and `path` match `operation` (path templates compared with parameters normalized).
4. CLI alias, for Bash: after shell parsing, the command starts with a `cli_aliases` `command`, compared token by token and ignoring global flags, and satisfies its `match`.
5. Otherwise `none`. Fuzzy matches may be offered as candidates, always labeled unverified, and never used for a policy decision.

Then:

- **Tool name alone informs but never lowers.** A step 2 match can show the record, its residue and undo plan, but the policy it yields is never below the surface's unknown default: `confirm_strong` everywhere (D8), and the D16 handling in the hook, so at least `ask` in strict mode.
- **Variants.** A variant applies only when every condition in its `when` is known to hold. `when.args` names API parameters, so it is evaluated only against them: the parameters of an operation match or the request an `operation_from_args` call builds. Against an MCP tool's own arguments or CLI flags it counts as unknown, even when a name is shared. The hook doesn't see account settings or plans, so a variant that names one is skipped there. With no applicable variant, use the top level, which is the strictest (V20); if several apply, use the strictest of them.
- **GraphQL.** Each root field of a request, query or mutation, is matched against `operation.path`; with several, the strictest result wins, and an unmatched field counts as unknown.
- **Bash.** A line with several commands (`&&`, `||`, `;`, pipes) is matched command by command; the strictest result wins. Wrappers (`bash -c`, `sh -c`, `eval`, `env`, `command`, `sudo`, `xargs`, `time`, `nohup`) are unwrapped and their argument parsed as a command line. A line that still can't be resolved (a command name built from a variable, `$(...)`, a script file) but mentions a CLI that has `cli_aliases` (such as `gh` or `aws`) gets `ask`, not the D16 unknown handling. Other unresolvable lines count as unknown.

## Non-goals

- Executing actions or brokering credentials for users.
- Being a runtime policy engine or firewall; the hook only asks or denies from records, and guards and gateways are partners.
- `allow` decisions in the hook (D17).
- Grading or ranking vendors. Records describe actions, not vendors (D11).
- Actions taken through a vendor's web UI. Records cover API calls and the MCP tools and CLI commands that make them.
- Standalone drift alerts. Drift shows up as record updates.
- Covering every endpoint of every API. Depth on the most-used, most-dangerous actions beats breadth.
- Testing against live accounts, ever.

## Launch coverage (week 12)

GitHub (REST, `gh` CLI and MCP tools) plus AWS actions that destroy data: 40 to 60 records, about 20 at `tested`. Stripe is a stretch goal. Other providers come after launch, chosen by buyer calls (D12).

## Glossary

- **Action:** one vendor API operation, such as `POST /v1/refunds`.
- **Residue:** anything that escapes or is lost before or despite an undo.
- **Effective confidence:** the confidence shown after staleness rules are applied at build time.
- **Drift:** a change in vendor behavior or docs that may invalidate a record.
- **Variant:** arguments, account settings or a plan under which an action differs from its default call in class, residue or undo. The record's top level is always at least as strict as every variant.
- **observed_by:** where a residue item comes from: `probe` (a harness probe saw that channel in a sandbox run), `proxy` (a run saw a stand-in for it) or `doc` (docs only).
- **tested_stale:** the effective confidence of a tested record whose newest passing run is more than 90 days older than the build. It keeps its tested facts and shows its last observed date.
- **Terms gate:** a provider's records reach `tested`, or appear in a finding that contradicts its docs, only when its terms are rated green or written consent is on file (D13, V24).
