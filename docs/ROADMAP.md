# Roadmap

Twelve weeks to a public launch, then nine months to revenue. Tick boxes as work lands; each week's prompt is in [PROMPTS.md](PROMPTS.md). Budget: 12 to 15 hours a week.

**Current week:** 1 (started 2026-09-30)

## Week 1: foundation

- [ ] Monorepo (pnpm, Turborepo, TypeScript strict, Vitest, tsup) with the packages in [ARCHITECTURE.md](ARCHITECTURE.md), stubs where noted
- [ ] `packages/schema`: JSON Schema v0 from [SCHEMA.md](SCHEMA.md), generated types, rules V1 to V19 with one test each
- [ ] `pnpm validate [files]` and `pnpm validate --fix`
- [ ] `.github/workflows/ci.yml`
- [ ] `packages/schema/test/fixtures/data/acme/`: a fictional provider and fixture records (valid R0, R3, R5 plus one invalid case per rule); the validator takes a data root so tests never touch `data/`
- [ ] LICENSE (Apache-2.0) at the root, `data/LICENSE` (CC BY-SA 4.0)
- [ ] Claude Code hooks confirmed working (validation hook fires on a bad record)

**Done when:** `pnpm install && pnpm validate && pnpm test` pass on a clean clone, and a deliberately broken record fails validation with a clear message.

## Week 2: first real records

- [ ] `data/github/_provider.yaml`
- [ ] 20 GitHub records at `draft` via `/add-action`, chosen from the tools the official GitHub MCP server exposes, highest risk first
- [ ] Each record reviewed by `adversarial-reviewer`; maintainer promotes reviewed ones to `documented`
- [ ] Landing page on palin.dev with a waitlist
- [ ] Scan annotations of the 20 most-installed MCP servers; draft 3 findings in `content/findings/`

**Done when:** 20 GitHub records pass validation, at least 15 are `documented`, and the landing page is live.

## Week 3: harness core

- [ ] `packages/harness`: `defineActionTest`, runner lifecycle, classify, trace, evidence
- [ ] Runner tested against a fictional `acme` mock (test fixtures only); a mock for each real provider; every action test runs in mock mode in CI
- [ ] Probe Workers in `apps/probes` (webhook and mailbox)
- [ ] GitHub sandbox client with all safety guards; 5 GitHub tests passing in sandbox mode
- [ ] GitHub coverage to 50 records

**Done when:** 5 GitHub records are `tested` with committed traces whose hashes recompute.

## Week 4: Stripe

- [ ] Stripe test-mode client, `ledger` probe, `stripe listen` webhook option
- [ ] 40 Stripe records, tests for all that test mode supports
- [ ] `packages/core`: `loadRepo`, `compileBundle` (staleness, draft exclusion, alias and operation indexes), `matchTool`, and `pnpm build:bundle` (the site and MCP server need these next)

**Done when:** 90 records total (50 GitHub, 40 Stripe), 30 `tested`, and `pnpm build:bundle` writes a valid bundle.

## Week 5: Slack and going public

- [ ] Slack developer workspace client, `observer` probe (second user or app)
- [ ] 35 Slack records
- [ ] `apps/site` v0: search, provider and action pages, `/classes`
- [ ] README current (the repo has been public since week 1)

**Done when:** palin.dev shows every non-draft record, and the repo is public.

## Week 6: MCP server

- [ ] `@palindev/mcp` with `check_action`, `undo_plan`, `what_leaks`, `classify_tools`, `search_actions` (see [SPEC.md](SPEC.md#3-mcp-server-week-6))
- [ ] Bundled snapshot; works offline; an end-to-end test with an MCP SDK stdio client
- [ ] Start Google batch (Gmail, Calendar, Drive)

**Done when:** the stdio test passes, and after `claude mcp add palin -- node packages/mcp-server/dist/index.js` and a Claude Code restart, `check_action` answers for every published record. (Publishing to npm comes at launch, in week 10.)

## Week 7: undo cookbook

- [ ] Tested undo snippets (TypeScript and Python) on R2 to R4 action pages
- [ ] Finish Google (60 records)

## Week 8: lint

- [ ] `@palindev/cli` with `palin lint` (text, JSON, SARIF)
- [ ] GitHub Action with PR summary comment and README badge
- [ ] Notion (25) and Linear (25) records

**Done when:** `palin lint` runs against a public MCP server repo and reports contradictions correctly on a fixture with known errors.

## Week 9: research

- [ ] Run `palin lint` across the 100 most-installed MCP servers; save raw results in `content/research/`
- [ ] Draft the research report
- [ ] AWS S3 and IAM (40 records)

## Week 10: soft launch

- [ ] Publish `@palindev/mcp` and `@palindev/cli` to npm (maintainer runs the publish)
- [ ] Post to r/mcp and r/ClaudeAI (maintainer posts; agents draft only)
- [ ] List the MCP server in the official MCP Registry and major directories
- [ ] Fix feedback

## Week 11: fill and retain

- [ ] Microsoft Graph (25) if a sandbox is available; otherwise more GitHub and Google
- [ ] Weekly digest newsletter from `/changes`
- [ ] "Palin checked" README badges

## Week 12: launch

- [ ] Publish the research report; Show HN
- [ ] 300 records, 200 `tested`

## Months 4 to 12

| Phase | Months | Deliverables |
| --- | --- | --- |
| Monetize | 4 to 6 | Billing through Basis; Pro and Team tiers; remote MCP server; drift alerts; guard SDK (TS and Python); Claude Code plugin; 1,000 records |
| Scale | 7 to 12 | Platform licenses; vendor verification; evidence packs; arXiv paper; MCP annotation extension proposal; 3,000 records |
