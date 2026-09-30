# Prompts

Copy-paste prompts for Claude Code that follow [ROADMAP.md](ROADMAP.md): one per week in phase 1 (validation) and one per block in phase 2 (narrow build). Start each session in the repo root. Use plan mode (Shift+Tab) for the first message of any week, approve the plan, then let it build.

Phase 2 prompts run only after [DECISIONS.md](DECISIONS.md) records a "go" (D10). Some prompts read or write `private/`; nothing from it goes into tracked files (D21). Agents never contact anyone outside this repo: they draft, and the maintainer sends, posts and publishes (D9).

## Every session

```
Read docs/ROADMAP.md and find the current week. Tell me what's done, what's
next, and anything blocking. Then wait.
```

## Week 1: minimum foundation

```
We're starting Palin. Read CLAUDE.md, docs/DECISIONS.md, docs/SPEC.md,
docs/SCHEMA.md, docs/ARCHITECTURE.md and docs/ROADMAP.md (week 1).

Build week 1:
1. A minimal pnpm workspace: TypeScript strict, ESM, Vitest, tsup, Node 22+,
   no Turborepo yet. Only packages/schema and packages/core (core stays a
   stub with a README until week 3's minimal lookup; week 4 builds it
   out). Other packages come when their surface is built.
2. packages/schema: record.schema.json and provider.schema.json implementing
   docs/SCHEMA.md exactly, including operation.service, variants, the alias
   matchers (match, operation_from_args), cli_aliases,
   flags.modifies_existing, residue[].observed_by, approval_text,
   undo.capture (response paths and `before` reads), provider terms, and
   sandbox_run tested_on and vendor_paid. Generate the TypeScript types.
   Implement the offline rules V1-V22 and V24 as separate functions, each
   with its own Vitest test (valid and invalid case). V23 needs the network
   and waits for week 2.
3. Root scripts: `pnpm validate [files...]` (all of data/ when no files;
   with files, the data root is the nearest ancestor directory named data,
   or `--root <dir>`, and every record loads for V2 and V17 but only
   problems in the named files are reported), `pnpm validate --fix` (V18
   key order), `pnpm test`, `pnpm typecheck`, `pnpm build`. Error output:
   file, rule id (`schema` for JSON Schema failures, `yaml` for parse
   errors), field path, plain message.
4. Fixtures (fictional, so CLAUDE.md rule 2 and D23 don't apply to them):
   packages/schema/test/fixtures/valid/data/acme/ holds _provider.yaml for
   a fictional provider acme with terms.status: green, a valid R0, an R3
   with variants, an R5 draft, and a tested R2 whose sandbox_run carries
   tested_on and vendor_paid; this root validates with zero errors.
   packages/schema/test/fixtures/invalid/<rule>/data/<provider>/ holds one
   minimal data root per rule that fails only that rule (V2: a provider
   directory without _provider.yaml; V24: a provider with terms.status:
   red and a tested record). The validator takes a data root and an
   injectable `now`, so tests run on fixtures with a fixed date and never
   on data/. data/ itself starts empty apart from data/LICENSE.
5. .github/workflows/ci.yml: install, typecheck, validate, test. Run the
   security-reviewer on it (minimal `permissions:`, no secrets).
6. LICENSE (Apache-2.0) at root and data/LICENSE (CC BY 4.0, with quotes
   from vendor docs excluded from the grant, per D15). Then link both from
   the License section of README.md.
7. Check the hooks in .claude/settings.json actually run: try `printenv
   PALIN_GUARD_CHECK`, an unset variable, so nothing prints even if the
   guard fails. The guard's printenv rule must block it; if it doesn't,
   `node` isn't on the hook's PATH, so tell me. Then create
   data/tmp/bad.yaml (it fails V2 because data/tmp has no _provider.yaml;
   that's the expected error), confirm the PostToolUse hook's message
   names the file, rule and field, and delete data/tmp/.
   Test fakes for secrets must contain FAKE on the same line.

Don't create accounts, don't add secrets, don't push. Finish by running
validate, typecheck and test, show me the tree, and tick the week 1 boxes
this work completes in docs/ROADMAP.md.
```

Week 1, part 2 (same week, separate session):

```
Week 1, part 2. Two drafting jobs; nothing gets sent.

1. Test actions. With doc-researcher subagents (up to 5 at once), find
   candidate actions on GitHub (REST and the `gh` CLI) and AWS (S3
   versioned deletes and similar data-destroying actions); both have green
   terms (D13). Prefer actions whose docs are thin or contradict each
   other. Keep only actions that can run in the GitHub test org or the AWS
   sandbox account (D14) without real money. Show me the candidates ranked,
   as a table: proposed id, operation, `gh` or `aws` command, MCP tool if
   any, likely undo, and the doc URLs and quotes that are thin or
   conflicting. Wait for my approval, then write the 15 I pick to
   private/moat-test/actions.md. Don't write records yet.
2. Outreach. Read private/PLAN.md and draft the first 8 messages from its
   target list and call script into private/outreach/. Drafts only: I send
   them (D9).

Nothing from private/ goes into tracked files (D21), and private/ is never
committed.
```

## Week 2: one tested record, timed

```
Week 2. Read docs/HARNESS.md end to end.

1. data/github/_provider.yaml from docs/templates/provider.yaml, citing
   GitHub's docs for every field. Write `terms.status: red` as a
   placeholder and put your proposed rating, with quotes from GitHub's API
   and developer terms, in `terms.notes`. Only I raise it (D23). Then stop
   GitHub work until I've set its terms.status. Item 2 uses only the
   fictional acme provider and can go ahead meanwhile; items 3 and 5 (the
   GitHub client, mock, action test and test stub) wait until GitHub is
   green or consent is on file (CLAUDE.md rule 3).
2. packages/harness minimum: defineActionTest, the runner lifecycle,
   classify, trace (redact, canonicalize, SHA-256) and evidence, with the
   CLI (`pnpm harness run <id>`, `--sandbox`, `pnpm harness evidence
   <run_id> [--write]`). The runner takes a data root and a tests root, so
   its tests run against an in-memory mock of the fictional acme provider
   with fixtures in packages/harness/test/fixtures/data and
   packages/harness/test/fixtures/actions, never in data/ or tests/actions/.
   Traces carry `"mode": "mock" | "sandbox"`. Mock runs write traces only
   to .harness-tmp/; sandbox `fail` and `inconclusive` traces go to
   runs/raw/, and only `pass` traces go to runs/YYYY/MM/. `evidence`
   refuses mock traces, and `--write` refuses draft records.
   packages/harness/test/actions.test.ts globs tests/actions/**/*.action.ts
   and runs each in mock mode; the root package.json lists
   @palindev/harness as a workspace:* devDependency.
3. The GitHub sandbox client with every guard in the HARNESS Safety table,
   and a GitHub mock so action tests run in mock mode under Vitest. It acts
   only as a private GitHub App registered under the test org and
   installed only there, and observes through one machine account whose
   classic token has only the `notifications` and `read:org` scopes. Never my personal account or the
   real palindev org: they're on the client's hard-coded denylist (D25).
   The client allows only test-org paths plus the owner-less calls HARNESS
   lists, and refuses /graphql and id-based routes.
   Observers use GitHub's own APIs (webhook deliveries, the observer
   account's notifications), not probe Workers. Tell me which variable
   names to put in .env.sandbox and add them, without values, to
   sandbox.env.example. Don't read .env.sandbox.
4. Run the security-reviewer on the harness and client code and fix what
   it finds.
5. Take one GitHub action from private/moat-test/actions.md whose undo is
   an API call (for example, delete a branch, then recreate the ref; the
   undo needs the ref's SHA, which the delete doesn't return, so
   undo.capture reads it before the call with a `before` item) end to
   end on `data/github-batch-1`: /add-action, the adversarial-reviewer,
   then stop for my review and promotion to documented. I run
   /verify-action to reach tested. Residue no observer captured stays
   `observed_by: doc`. After each step, append the step and the hours spent
   to private/moat-test/hours.md, and ask me for my own review and verify
   time.

Don't push. If the run contradicts GitHub's docs, tell me first: the record
change goes on a separate local-only branch `embargo/<YYYY-MM-DD>-<id>`,
never on data/github-batch-1, until the vendor's reply window closes, and
its trace stays in runs/raw/ until I release it to that branch (D13, D22). A pass that saw residue the record
doesn't list counts too: its trace waits in runs/raw/ until I decide.
```

After review, promote the ones you've checked with the prompt under [Reusable prompts](#reusable-prompts).

Week 2, part 2 (same week, separate session):

```
Week 2, part 2.
1. The V23 quote checker: `pnpm validate --quotes` fetches each doc
   evidence url, checks the quote appears after whitespace and punctuation
   normalization, and writes the SHA-256 of the normalized page text to
   `.palin/quote-hashes.json` (override with `--hashes <path>`), keyed by
   URL, for drift detection. Failures are warnings naming the record and
   URL. It never runs in the offline validate that hooks and CI use. Tests
   use saved fixture pages, not vendor sites, and write hashes to a
   temporary directory.
2. Draft (don't post) a note for the MCP Tool Annotations Interest Group
   in content/standards/: R0 to R5 mapped to the proposed outcome tiers,
   Palin records as an evidence scheme, and argument variants as the
   answer to the closed per-argument proposal. Link and quote the
   proposals you refer to; don't describe them from memory. I post it
   (D9).
```

## Week 3: the blind comparison

```
Week 3. Three parts; show me each list before building.

1. Reach 15 tested records. Add data/aws/_provider.yaml with
   `terms.status: red` and your proposed rating, quoted, in `terms.notes`
   (D23). Then stop until I've set
   terms.status for AWS. The sandbox client and action tests wait for
   green (HARNESS and test-writer refuse otherwise). Once it's green, add
   an AWS sandbox client with every guard in the Safety table. The tenant
   allowlist is the sandbox account id and `AWS_SANDBOX_ORG_ID`, and
   preflight refuses the management account and fails closed on any
   DescribeOrganization error (D14). Credentials and region come only from
   `AWS_SANDBOX_*` in process.env, never from AWS profiles, shared config
   files or instance metadata. The teardown script is a Node entry point
   that reuses the client and the full preflight, never the AWS CLI. Run
   the security-reviewer on it. Then /add-action the rest of
   private/moat-test/actions.md, one branch per provider batch
   (data/<provider>-batch-<n>), up to 5 doc-researchers and then up to 5
   adversarial-reviewers at once. Include cli_aliases for the `gh` and
   `aws` commands. Write an action test for each and make it pass in mock
   mode. I review, promote and run /verify-action.
2. The blind comparison, for each tested record:
   a. Write the questions to private/moat-test/: what escapes, how to
      undo, how long the undo works, and who can undo. Word them as a user
      would, with no hints from the tested result.
   b. Get answers from a frontier model with web retrieval and from a
      smaller model with no tools, each in a fresh context that can't see
      this repo or private/ (a subagent limited to web tools and one with
      no tools, or give me the prompts to run elsewhere). Discard and rerun
      any answer that cites Palin's own repo or site. Log the model, date,
      exact prompt and full answer in private/moat-test/.
   c. Only then compare each answer with the tested result and the docs.
      Mark each question right, partly right, wrong or unanswered, and note
      where the docs are thin or contradict the run. Don't change records
      because of model answers.
3. A rough Claude Code PreToolUse hook on `mcp__github__*` and Bash `gh`
   and `aws` commands, in its own package, reading records through
   packages/core (a minimal lookup is enough; week 4 builds matchTool). It
   answers `ask` or `deny` with the residue and undo plan in the reason,
   and never `allow` (D17). An action with no record gets no decision, plus
   context saying no Palin record exists and to treat it as irreversible;
   strict mode turns that into `ask` (D16). Test a wrapped command (such
   as `bash -c 'gh repo delete …'`, `xargs` or `sudo`), which is unwrapped
   and matched, and an unresolvable line that mentions `gh` or `aws`, which
   gets `ask` (docs/SPEC.md, Tool-to-record matching). Run the
   security-reviewer on it. Don't edit .claude/settings.json; give me the snippet to install it.
   Put demo notes in the package README for a two-minute demo that uses
   only the GitHub test org and the AWS sandbox account. I record the demo
   and use it on calls (D9).

Nothing from private/ goes into tracked files (D21). Don't push.
```

## Week 4: decide

```
Week 4.
1. packages/core per docs/ARCHITECTURE.md: loadRepo, compileBundle
   (effective confidence, with a tested record whose newest passing run is
   over 90 days old compiled as tested_stale; drafts excluded unless
   --include-drafts; alias, CLI and operation indexes), matchTool and
   `pnpm build:bundle`. matchTool follows the order in docs/SPEC.md and
   adds argument matchers (`match`), operation_from_args for generic tools
   such as a `*_api_write`, CLI aliases (token match after shell parsing,
   ignoring global flags, with the wrapper and unresolvable-line rules in
   docs/SPEC.md) and variants: return the strictest variant whose `when`
   is known to hold (`when.args` only against API parameters), or the top
   level when none can be evaluated.
   Nothing ever reports an unmatched action as safe (D8, D16). A test for
   each, on the acme fixtures. Then switch the week 3 hook to matchTool.
2. Read private/PLAN.md and score each go/no-go criterion from the logs in
   private/moat-test/ and the call notes I give you. Write the scoring to
   private/moat-test/. Then draft the DECISIONS.md entry: the outcome and a
   pointer to private/PLAN.md, with no thresholds, prices or names from
   private/ (D21). Show it to me; I confirm it before it's added, and no
   phase 2 work starts until then.
```

## Weeks 5 to 8: depth and the plugin

```
Weeks 5 to 8. First check that DECISIONS.md records a go; if not, stop.

1. Depth. Propose the actions that take GitHub to 30 records (15 tested)
   and AWS data-destroying actions to 10 (5 tested), and wait for my
   approval. Then /add-action per provider batch, with `variants` for
   account settings such as S3 versioning and deletion protection, and
   action tests in mock mode. Where the sandbox can exercise a variant,
   test it and record it in `tested_on`. I review, promote and run
   /verify-action.
2. Plugin. Package the hook as a Claude Code plugin: `mcp__*` and Bash
   matchers, unknown actions per D16, strict mode, never `allow` (D17). It
   ships a bundle snapshot and fetches a new bundle weekly from palin.dev
   (a retention signal without telemetry code), using it only after its
   signature verifies and keeping the last good bundle otherwise. The
   bundle carries an expiry date; past it, the plugin keeps asking and
   denying from the expired records and says so, because expiry never
   removes a prompt (D24). Tests for decisions, unknown actions, an expired
   bundle that still asks for R3 to R5, a bundle that fails verification, variants,
   generic tools and CLI parsing (including wrapped and unresolvable
   commands). Run the security-reviewer on it. Don't publish or submit it.
3. Right of reply. For each tested result that contradicts vendor docs, on
   a provider with green terms or consent on file, draft an email to the
   vendor in private/right-of-reply/, so nothing is public before the
   vendor has seen it. Include the record, the doc quote and URL, what the
   sandbox run showed (from the redacted trace, never raw vendor
   payloads) and the 14-day reply window. If it looks like a security
   issue, draft a report for the vendor's disclosure program in
   private/disclosures/ instead.
   Drafts only: I send them by the end of week 8 (D9, D13) and note the
   sent date in each file. The record changes stay on local-only
   `embargo/<YYYY-MM-DD>-<id>` branches, never on a batch branch that gets
   pushed, until each reply window closes; their traces join those branches
   only when I release them from runs/raw/ (D22).
```

## Weeks 9 to 12: publish

```
Weeks 9 to 12. Build locally; I deploy, post, submit and publish (D9).

1. apps/site: a static Astro site reading the compiled bundle through
   packages/core. A page per record that shows residue provenance
   (`observed_by`, "Observed in <sandbox> on <date>" with the count of
   residue items a probe or proxy saw, and the last observed date for
   tested_stale records), /classes, /llms.txt, the redacted traces for
   tested records with raw vendor payloads left out (D13), and the bundle
   the plugin fetches. Plain, fast and readable on a phone.
2. Three incident pages, "what the record would have said": public,
   linked sources only, each matched to a documented or tested record, and
   no claims beyond the sources.
3. One findings post with /write-finding, for a green-terms provider, only
   after its right-of-reply window has closed.
4. Launch prep: package.json fields, README, files list and a dry-run pack
   for the plugin and the @palindev packages. Draft the plugin directory
   submissions, the Show HN and the launch posts in content/launch/. Give
   me the publish commands once I confirm the D20 name clearance check is
   done.
5. Stretch, only after 1 to 4: Stripe. Add data/stripe/_provider.yaml
   with `terms.status: red` and your proposed rating, quoted, in
   `terms.notes` (D23), then stop until I've rated it. Only if it's green
   or consent is on file: about 10 records (3 tested) for the
   fee-retention finding, with a test-mode client that rejects non-test
   keys and aborts on any live-mode response. Otherwise draft the records
   only, with no client, mock or tests; they stay below tested (V24).
6. Full audit: validate, typecheck, tests, broken links, tested_stale
   records, and coverage (total, tested, by provider). Give me a launch
   checklist with anything red.
```

## Reusable prompts

- **Batch of actions:** `/add-action <provider> <operation> [<operation> ...]` (drafts only; more than 5 operations means a list for approval first)
- **Verify:** `/verify-action <id>` (runs real sandbox calls; only you trigger it). Terms gate: a record reaches `tested` only if its provider's `terms.status` is green or `terms.consent` is filled in (D13, V24)
- **Drift:** `/triage-drift <provider> <changelog URL>`
- **Lint someone's server:** `/lint-server <repo path or GitHub URL>` (static only; label findings `spec_violation` or `risk_not_expressible` per docs/SCHEMA.md). The report, patch and PR text are drafts in `content/lint/`; you decide whether to submit (D9)
- **Write a post:** `/write-finding <id> "<what surprised you>"` (drafts only; you post, D9). Right of reply: a finding that contradicts vendor docs needs green terms or consent, goes to the vendor first, and waits out the 14-day reply window; security issues go through the vendor's disclosure program (D13)
- **Promote after review:** `I've reviewed these ids: <ids>. First run pnpm validate --quotes on their files and resolve every warning (V23). Then, for each: resolve every todo item or turn it into an "Open question:" line in notes and remove it, confirm every field required for non-drafts is present (including every key of flags and undo and all four suggested_annotations hints), confirm every residue item has observed_by: doc (only a passing sandbox_run can back probe or proxy), confirm approval_text is present and at most 120 characters on R3 to R5 records and on any variant with class R3 to R5, and null on any R0 to R2 variant of an R3 to R5 record, then set confidence to documented and last_verified to today. Run pnpm validate.`
