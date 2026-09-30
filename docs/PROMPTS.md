# Prompts

Copy-paste prompts for Claude Code, one per roadmap week. Start each session in the repo root. Use plan mode (Shift+Tab) for the first message of any week, approve the plan, then let it build.

## Every session

```
Read docs/ROADMAP.md and find the current week. Tell me what's done, what's
next, and anything blocking. Then wait.
```

## Week 1: foundation

```
We're starting Palin. Read CLAUDE.md, docs/SPEC.md, docs/SCHEMA.md,
docs/ARCHITECTURE.md and docs/ROADMAP.md (week 1).

Build week 1:
0. If this folder isn't a git repo yet, run `git init -b main`, commit the
   starter docs, and add the remote
   https://github.com/TheophilusJohn/palindev.git (don't push; I will).
1. pnpm + Turborepo monorepo, TypeScript strict, ESM, Vitest, tsup, Node 22+.
   Packages per docs/ARCHITECTURE.md: schema and core for real; harness,
   mcp-server, cli and sdk-ts as stubs with a README each.
2. packages/schema: record.schema.json and provider.schema.json implementing
   docs/SCHEMA.md exactly, generated TypeScript types, and rules V1-V19 as
   separate functions, each with its own Vitest test (valid and invalid case).
3. Root scripts: `pnpm validate [files...]` (all of data/ when no files),
   `pnpm validate --fix` (V18 key order), `pnpm test`, `pnpm typecheck`,
   `pnpm build`. Error output: file, rule id, field path, plain message.
4. packages/schema/test/fixtures/data/acme/: a fictional provider and
   fixture records (valid R0, R3 and R5, plus one invalid file per rule).
   The validator takes a data root, so tests run on fixtures and never on
   data/. data/ itself starts empty apart from data/LICENSE.
5. .github/workflows/ci.yml: install, typecheck, validate, test.
6. LICENSE (Apache-2.0) at root and data/LICENSE (CC BY-SA 4.0).
7. Check the hooks in .claude/settings.json actually run: try `printenv`
   (the guard must block it; if it doesn't, `node` isn't on the hook's PATH,
   so tell me), then create data/tmp/bad.yaml with a deliberate error,
   confirm the PostToolUse hook reports it clearly, and delete data/tmp/.
   Test fakes for secrets must contain FAKE on the same line.

Don't create accounts, don't add secrets, don't push. Finish by running
validate, typecheck and test, show me the tree, and tick the week 1 boxes in
docs/ROADMAP.md.
```

## Week 2: first GitHub records

```
Week 2. First create data/github/_provider.yaml using docs/templates/provider.yaml,
citing GitHub's docs for every field.

Then list the tools exposed by the official GitHub MCP server
(github/github-mcp-server) that change state, rank them by damage potential
(R5 and R3 first, then money/permissions/third parties), and show me the top
20 as a table with the REST operation each maps to. Wait for my approval.

After approval, run /add-action on branch `data/github-batch-1`, running up
to 5 doc-researcher subagents at once and then up to 5 adversarial-reviewers
at once. Show me a table: id, class, policy, open questions. Don't promote
anything past draft.
```

After review, promote the ones you've checked with the prompt under [Reusable prompts](#reusable-prompts).

Week 2, part 2 (same week, separate session):

```
Two things, no deploys.
1. apps/site as a single landing page for now: what Palin is (from
   README.md), the six classes, and a waitlist form that posts to a
   Cloudflare Worker in apps/api/waitlist storing emails in KV, with a
   honeypot field and rate limiting. Give me the deploy steps.
2. Static annotation scan: for the 20 most-installed MCP servers (I'll give
   you the list), run /lint-server --report-only on each. Never install or
   run the servers. Then pick the 3 most notable findings backed by
   documented records and run /write-finding for each.
```

## Week 3: harness core

```
Week 3. Read docs/HARNESS.md end to end. Build packages/harness: define.ts,
runner.ts (the 12-step lifecycle), classify.ts, trace.ts (redaction,
canonical JSON, SHA-256), evidence.ts, and the CLI (`pnpm harness run`,
`--sandbox`, `pnpm harness evidence <run_id> [--write]`).

Test the runner itself against an in-memory mock of the fictional acme
provider (fixtures in packages/harness/test/fixtures, never in data/). Then
make every tests/actions/**/*.action.ts run in mock mode under Vitest, with
a mock for each real provider as it's added.

Then build apps/probes: two Cloudflare Workers (webhook receiver and Email
Worker mailbox) storing events in KV by run id, with wrangler.toml files and
a deploy README. Don't deploy; I'll do that.

Then the GitHub sandbox client with every guard in the Safety table, and
action tests for 5 GitHub records. Tell me exactly which env vars to put in
.env.sandbox; I'll run the sandbox tests myself with /verify-action.

Finally, list the next 30 GitHub actions by risk for my approval, then
/add-action them on `data/github-batch-2` to reach 50.
```

## Week 4: Stripe

```
Week 4. Add data/stripe/_provider.yaml, then pick the 40 highest-risk Stripe
actions exposed by the official Stripe MCP server and the common agent
workflows (refunds, payouts, subscriptions, customers, invoices, payment
links). Show me the list first.

After approval: /add-action in batches, a Stripe test-mode client that
rejects non-test keys and aborts on any livemode response, a ledger probe
for fees and balance, and action tests for everything test mode supports.
Records that test mode can't exercise stay documented with a note saying why.

Then packages/core per docs/ARCHITECTURE.md: loadRepo, compileBundle
(effective confidence with the 30-day staleness rule, drafts excluded
unless --include-drafts, alias and operation indexes), matchTool (the
matching order in docs/SPEC.md) and `pnpm build:bundle`. Tests for each.
```

## Week 5: Slack and the website

```
Week 5, two parts.

Part 1: Slack. Provider file, 35 records from the Slack MCP servers' tools,
a Slack client for a developer workspace, and an observer probe using a
second test user or app subscribed to events. Action tests for each.

Part 2: apps/site with Astro and Pagefind, reading the compiled bundle from
packages/core: /, /p/[provider], /a/[id], /classes, /llms.txt, structured
data per action page, and a badge endpoint, replacing the week 2 landing
page but keeping the waitlist form. Keep it fast, plain and readable on a
phone. Build locally; I'll deploy to Cloudflare Pages.
```

## Week 6: MCP server

```
Week 6. Build packages/mcp-server as @palindev/mcp per docs/SPEC.md section
3: check_action, undo_plan, what_leaks, classify_tools, search_actions, all
reading a bundled snapshot through packages/core. Our own tool annotations
must be correct: readOnlyHint true, destructiveHint false, idempotentHint
true, openWorldHint false.

Test it end to end with a Vitest test that starts the built server over
stdio using the MCP SDK client and calls every tool, including check_action
for an unknown tool (must advise R5). Then give me the exact
`claude mcp add palin -- node packages/mcp-server/dist/index.js` command;
I'll add it and restart Claude Code to try it. Don't publish to npm.
Then start the Google batch (Gmail, Calendar, Drive): list first, approve,
then /add-action.
```

## Week 7: undo cookbook

```
Week 7. For every R2-R4 record with a tested undo, generate TypeScript and
Python undo snippets from the harness's undo step and show them on the
action page. Snippets must match what the harness actually ran. Finish the
Google batch to 60 records.
```

## Week 8: palin lint

```
Week 8. Build packages/cli as @palindev/cli with binary `palin` and the
`lint` command per docs/SPEC.md section 5 (text, JSON and SARIF output,
--fail-on, exit codes). Inputs: a local repo path (find tool definitions in
TS/Python MCP servers), a GitHub URL (shallow clone to a temp dir), or a
captured tools/list JSON. Static analysis only: never install, build or run
the server being linted. Add a fixture MCP server with known wrong
annotations and test that every finding type fires.

Then a GitHub Action in .github/actions/palin-lint that runs the CLI and
posts a PR summary. Then Notion and Linear batches (25 each).
```

## Week 9: research

```
Week 9. Build scripts/scan-top-servers.ts: take a list of the 100
most-installed MCP servers (I'll give you the list or its source), run
palin lint on each (static only; never install or run them), and save raw
JSON to content/research/2026-scan/. Then
draft content/research/report.md: method, numbers, the 10 most notable
findings with links to records, and limitations. Every number must come
from the raw files. Then the AWS S3 and IAM batch (40).
```

## Week 10: soft launch

```
Week 10. Draft (don't post) launch posts for r/mcp and r/ClaudeAI in
content/launch/, a README update, and the MCP Registry listing metadata.
Prepare @palindev/mcp and @palindev/cli for npm (package.json fields,
README, files list, a dry-run pack) and give me the publish commands;
I'll run them.
Run a full audit: validate, tests, broken links on the site, stale records.
Give me a launch checklist with anything that's red.
```

## Week 11: fill and retain

```
Week 11. Microsoft Graph batch (25) if I confirm a developer sandbox;
otherwise 25 more GitHub and Google actions. Build the /changes feed and a
weekly digest generator (content/digest/YYYY-MM-DD.md from git history of
data/). Add the "Palin checked" badge to the lint Action.
```

## Week 12: launch

```
Week 12. Finalize content/research/report.md from fresh scan data, draft
the Show HN post and a findings thread, and run the full audit again. Tell
me the coverage numbers (total, tested, by provider) and anything that
should block launch.
```

## Reusable prompts

- **Batch of actions:** `/add-action <provider> <operation> [<operation> ...]`
- **Verify:** `/verify-action <id>` (runs real sandbox calls; only you trigger it)
- **Drift:** `/triage-drift <provider> <changelog URL>`
- **Lint someone's server:** `/lint-server <repo path or GitHub URL>`
- **Write a post:** `/write-finding <id> "<what surprised you>"`
- **Promote after review:** `I've reviewed these ids: <ids>. For each: resolve every todo item or turn it into an "Open question:" line in notes and remove it, confirm every field required for non-drafts is present, then set confidence to documented and last_verified to today. Run validate.`
