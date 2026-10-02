# Roadmap

Validate first, then build narrowly. Weeks 1 to 4 test whether Palin's tested records know something a frontier model with web retrieval doesn't, and whether anyone will pay (D10). Weeks 5 to 12 run only after a "go". Tick boxes as work lands; each week's prompt is in [PROMPTS.md](PROMPTS.md). Budget: 12 to 15 hours a week. Hour caps and go/no-go criteria are in `private/PLAN.md` (D21).

Boxes marked **(maintainer)** are outside contact or account work that agents can't do (D9). Agents draft the text into `content/` or `private/`; the maintainer sends it.

**Current week:** 1 (started 2026-09-30)

## Phase 1: validation (weeks 1 to 4, to about 2026-10-28)

### Week 1: decisions and the minimum foundation

- [x] Record the validation-research decisions (D10 to D25) and move business material out of tracked docs
- [x] pnpm workspace (TypeScript strict, ESM, Vitest, tsup; Turborepo later if build times need it) with `packages/schema` and `packages/core`. Create the other packages when their surface is built
- [x] `packages/schema`: JSON Schema v0 from [SCHEMA.md](SCHEMA.md), including `operation.service`, `variants`, alias matchers, `cli_aliases`, `flags.modifies_existing`, `residue[].observed_by`, `approval_text`, `undo.capture`, provider `terms`, and `tested_on` and `vendor_paid` on sandbox runs. Generate the types. Implement offline rules V1 to V22 and V24 with one test each
- [x] `pnpm validate [files]` and `pnpm validate --fix`
- [x] `.github/workflows/ci.yml` (install, typecheck, validate, test), with a `security-reviewer` pass
- [x] Schema fixtures (fictional, exempt from CLAUDE.md rule 2 and D23): `packages/schema/test/fixtures/valid/data/acme/` (a green-terms provider, a valid R0, an R3 with variants, an R5 draft and a tested R2) validates with zero errors, and each `packages/schema/test/fixtures/invalid/<rule>/` data root fails only that rule. The validator takes a data root and an injectable `now`, so tests never touch `data/`
- [x] LICENSE (Apache-2.0) at the root; `data/LICENSE` (CC BY 4.0, with vendor-doc quotes excluded from the grant, per D15)
- [x] Claude Code hooks confirmed working (the guard blocks `printenv PALIN_GUARD_CHECK`, and the validation hook fires on a bad record)
- [x] Choose the 15 test actions on green-terms providers (GitHub REST and `gh` CLI, AWS S3 versioned deletes and similar), preferring actions whose docs are thin or conflicting. List them in `private/moat-test/actions.md`
- [ ] **(maintainer)** AWS sandbox account per D14; GitHub test org with a private GitHub App registered under it and installed only on it (the acting identity), and one machine account as the observer with a classic token scoped to `notifications` and `read:org` only; never your personal account (D25)
- [ ] **(maintainer)** Claim handles: npm org `palindev`, GitHub org `palindev`. PyPI `palindev` is free, but PyPI names are taken by a first real upload, not reserved
- [ ] **(maintainer)** Target list and call script from `private/PLAN.md`; send the first 8 messages

**Done when:** `pnpm install && pnpm validate && pnpm test` pass on a clean clone, a deliberately broken record fails validation with a clear message, and the 15 test actions are chosen.

### Week 2: one tested record, timed

- [ ] `data/github/_provider.yaml` with terms evidence; the agent writes `terms.status: red` with a proposed rating in `notes` and stops GitHub work until the maintainer sets the real rating (D23)
- [ ] `packages/harness` minimum: `defineActionTest`, runner lifecycle (with a data root and a tests root), classify, trace (redact, canonicalize, hash), evidence. Mock mode for the fictional `acme` fixture, which can go ahead before GitHub is rated
- [ ] Once the maintainer has rated GitHub green (or consent is on file): GitHub sandbox client with every guard in the HARNESS Safety table. It acts only as the test-org GitHub App (D25). Observers use GitHub's own APIs (webhook deliveries, the observer account's notifications) instead of probe Workers
- [ ] One GitHub record whose undo is an API call (for example, delete a branch, then recreate the ref), taken end to end: draft, adversarial review, maintainer review to `documented`, sandbox run to `tested`. Log the hours for each step in `private/moat-test/hours.md`
- [ ] V23 quote checker (`pnpm validate --quotes`)
- [ ] **(maintainer)** Post the MCP Tool Annotations Interest Group note drafted in `content/standards/`: R0 to R5 mapped to the proposed outcome tiers, Palin records as an evidence scheme, and argument variants as the answer to the closed per-argument proposal
- [ ] **(maintainer)** 8 more messages; first 2 calls
- [ ] **(maintainer)** Two-hour name clearance check (D20)

### Week 3: the blind comparison

- [ ] Reach 15 tested records across GitHub and AWS, including `cli_aliases` for the `gh` and `aws` commands
- [ ] For each tested record, write the "what escapes, how to undo, how long, who can undo" questions. Log blind answers from a frontier model with web retrieval and from a smaller model without tools before comparing them with the tested result. Record them in `private/moat-test/`
- [ ] A rough Claude Code PreToolUse hook on `mcp__github__*` and Bash `gh` and `aws` commands, reading records through a minimal `packages/core` lookup. It answers `ask` or `deny` with the residue and undo plan in the reason, and never `allow` (D17). Demo notes go in its README
- [ ] **(maintainer)** Record a two-minute demo from the hook's README notes
- [ ] **(maintainer)** 4 or 5 calls using the demo; offer the catalog audit described in `private/PLAN.md`

### Week 4: decide

- [ ] Full `packages/core`: `loadRepo`, `compileBundle` (staleness to `tested_stale`, draft exclusion, alias, CLI and operation indexes), `matchTool` (argument matchers, CLI aliases, operation extraction for generic tools, strictest applicable variant) and `pnpm build:bundle`. Switch the hook to it
- [ ] **(maintainer)** Remaining calls; deliver the first one or two catalog audits
- [ ] Score the go/no-go criteria in `private/PLAN.md` and record the outcome as a new DECISIONS entry

**Done when:** the go/no-go outcome is recorded in [DECISIONS.md](DECISIONS.md).

## Phase 2: narrow build (weeks 5 to 12, only after a "go")

### Weeks 5 to 8: depth and the plugin

- [ ] GitHub to 30 records (15 tested); AWS data-destroying actions to 10 records (5 tested), with `variants` for account settings such as versioning and deletion protection
- [ ] Package the hook as a Claude Code plugin: `mcp__*` and Bash matchers, unknown actions handled per D16, strict mode, and a weekly, signature-checked bundle fetch from palin.dev (a retention signal without telemetry code). Past the bundle's expiry date the hook keeps asking and denying from its last records and says the data has expired; expiry never removes a prompt (D24)
- [ ] **(maintainer)** Send right-of-reply emails for any tested result that contradicts vendor docs by the end of week 8; those record changes and traces stay on local-only `embargo/` branches until the reply window closes (D13, D22)
- [ ] **(maintainer)** Discovery continues; aim for the first paid pilot

### Weeks 9 to 12: publish

- [ ] `apps/site` as a static Astro site: a page per record with the residue provenance shown, `/classes`, `/llms.txt`, and the published redacted traces for tested records
- [ ] Three incident pages: "what the record would have said"
- [ ] One findings post on green-terms providers, after the right-of-reply window closes (drafted with `/write-finding`)
- [ ] **(maintainer)** Submit the plugin to the Claude Code plugin directories; publish packages to npm under `@palindev`
- [ ] Stretch: Stripe, about 10 records for the fee-retention finding. The agent writes `terms.status: red` and stops until the maintainer rates it; the test-mode client and up to 3 tested records only if it's green or consent is on file (V24)
- [ ] **(maintainer)** Launch: a Show HN and posts drafted in `content/launch/`

**Done when:** 40 to 60 records (about 20 tested) are live on palin.dev, the plugin installs in one command, and at least one findings post is out.

## After launch: only with a named external signal

| Work | Starts when |
| --- | --- |
| Scheduled sandbox re-verification and `drift-watch.yml` | A paying customer needs a freshness commitment |
| MCP server, `palin lint`, SDK `guard()`, undo cookbook, exporters for other hosts (Codex, Cursor, Gemini CLI, OpenClaw) | A named partner asks for that surface |
| More providers (Google, Supabase, Neon, Atlassian, Linear, others) | Buyer calls pick the segment, and the provider's terms are green or consent is on file |
| Tested records for Slack, Notion or Microsoft | Written consent from the vendor (D13) |
| Agent exposure report; action log with undo handles | A design partner asks for it |
