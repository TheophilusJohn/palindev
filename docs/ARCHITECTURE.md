# Architecture

A TypeScript monorepo where the Git repo is the database. YAML records compile into one versioned bundle that every surface reads. The first surface is a Claude Code PreToolUse hook, then the site; the MCP server, `palin lint` and the SDKs wait until a named partner asks (D17).

## Data flow

```
vendor docs ──► doc-researcher ──► record-drafter ──┐
changelogs ───► triage-drift ───────────────────────┤
sandbox ──────► harness runs ──► evidence ──────────┼──► pull request ──► review ──► data/ (main)
community ──────────────────────────────────────────┘       (adversarial-reviewer, CI validate)
                                                                                  │
                                                                     CI build: bundle (JSON, later SQLite)
                                                                                  │
                                                          ┌───────────────────────┼─────────────────────┐
                                                  Claude Code hook              site      later: MCP server, lint, SDKs
```

## Repository layout

```
palin/
├── CLAUDE.md
├── README.md
├── docs/                       # SPEC, SCHEMA, HARNESS, ARCHITECTURE, ROADMAP, PROMPTS, DECISIONS, templates/
├── data/<provider>/            # _provider.yaml and <resource>.<verb>.yaml (CC BY 4.0, vendor-doc quotes excluded; D15)
├── runs/YYYY/MM/               # redacted traces of passing sandbox runs (others stay in gitignored runs/raw/)
├── tests/actions/<provider>/   # one *.action.ts per record
├── packages/
│   ├── schema/                 # record.schema.json, generated types, rules V1-V24, `palin-validate` bin (week 1)
│   ├── core/                   # load records, compile bundle, staleness, tool and CLI matching (stub in week 1, minimal lookup in week 3, full build in week 4)
│   ├── harness/                # defineActionTest, runner, probes, provider clients and mocks (week 2)
│   ├── hook/                   # Claude Code PreToolUse hook (week 3), packaged as a plugin in weeks 5 to 8
│   ├── mcp-server/             # @palindev/mcp (when a partner asks)
│   ├── cli/                    # @palindev/cli, binary `palin` (lint, check, validate) (when a partner asks)
│   └── sdk-ts/                 # @palindev/sdk (when a partner asks)
├── apps/
│   ├── site/                   # Astro + Pagefind (weeks 9 to 12)
│   └── probes/                 # Cloudflare Workers for webhook and mailbox probes, if a provider needs them
├── content/                    # public drafts (findings, lint reports, drift PR text, standards notes, launch posts); never auto-published
├── private/                    # gitignored: business material (D21), right-of-reply and disclosure drafts; tracked files may point here but never copy it
├── scripts/
└── .github/workflows/          # ci.yml, site.yml; verify-scheduled.yml and drift-watch.yml deferred
```

Each package or app is created when its surface is built, not up front. `apps/probes` may not be needed for GitHub: its observers use GitHub's own APIs (webhook deliveries, the observer machine account's notifications; D25) instead of probe Workers. There is no hosted API (D19). `packages/sdk-py/` (PyPI `palindev`) waits for a named partner, like the other SDKs (D17).

## Package responsibilities

| Package | Depends on | Exposes |
| --- | --- | --- |
| `schema` | none | JSON Schema, TypeScript types, `validateRecord`, `validateRepo`, CLI `palin-validate [files]` |
| `core` | `schema` | `loadRepo`, `compileBundle`, `effectiveConfidence`, `matchTool` (MCP aliases with argument matchers, CLI aliases, operations read from generic tools), `minPolicy` |
| `harness` | `schema`, `core` | `defineActionTest`, runner CLI (`pnpm harness …`) |
| `hook` | `core` | PreToolUse handler that answers `ask` or `deny`, never `allow` (D17); unknown actions per D16; strict mode |
| `mcp-server` | `core` | stdio server; bundled snapshot (later, D17) |
| `cli` | `core` | `palin lint`, `palin check`, `palin validate` (later, D17) |
| `sdk-ts` | `core` | `guard`, `lookup`, policy types (later, D17) |

Rule: surfaces never read YAML directly. They read the compiled bundle through `core`.

## Bundle

`pnpm build:bundle` writes `dist/bundle/palin-YYYY-MM-DD.json`:

```json
{
  "schema_version": "0",
  "generated_at": "2026-10-05T00:00:00Z",
  "expires_at": "2026-11-05T00:00:00Z",
  "providers": [],
  "records": [],
  "alias_index": {
    "acme/acme-mcp#send_invoice": [{ "id": "acme.invoices.send" }],
    "acme/acme-mcp#invoice_write": [{ "id": "acme.invoices.send", "match": { "method": "send" } }]
  },
  "cli_index": { "acme invoices send": [{ "id": "acme.invoices.send" }] },
  "operation_index": { "acme POST /v1/invoices/{}/send": "acme.invoices.send" }
}
```

- `operation_index` keys are `<provider> [<service>] [<method>] <path>`: `service` only when the operation has one (always for AWS), `method` only for HTTP, and path parameters as `{}`. V17 keeps each key to one record.
- `alias_index` and `cli_index` values are lists of candidates, because one tool or command can map to several records. Each candidate carries the alias's `match` or `operation_from_args`, and `matchTool` in `core` evaluates them against the call's arguments. A candidate with `operation_from_args` resolves through `operation_index`.
- Each compiled record adds `effective_confidence` and `url`. `effective_confidence` is `tested_stale` when the newest passing run is more than 90 days older than the build; that value exists only in bundles. Drafts are excluded unless `--include-drafts` is passed.
- Records keep their `variants`. A surface that can evaluate a variant's `when` uses it; one that can't uses the top level, which V20 makes at least as strict.
- After `expires_at`, the hook keeps answering `ask` or `deny` from the expired records and says the data has expired; only actions those records don't cover get the D16 unknown handling. Surfaces that can answer permissively (MCP server, SDK) treat every action as unknown (R5) instead (D24). The plugin fetches a fresh bundle from palin.dev weekly and uses it only after its signature verifies, keeping the last good bundle otherwise. The signing key stays with the maintainer outside the repo and is used only in the release step; the plugin pins the matching public key. Open question: the expiry period.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node 22 LTS or newer, ESM only |
| Package manager | pnpm 11, pinned by `packageManager` in `package.json` (installed directly locally, since Node 25+ no longer ships Corepack; `pnpm/action-setup` in CI), workspaces; dependency build scripts are off (`allowBuilds`); Turborepo later if build times need it |
| Language | TypeScript 6, `strict: true`; not 7 yet, because tsup's `.d.ts` build needs the JS API that TypeScript 7 doesn't ship (D26) |
| Tests | Vitest |
| Build | tsup (no longer maintained; its `.d.ts` build sets `ignoreDeprecations: "6.0"`, D26). In the repo, `pnpm validate` runs the validator's TypeScript source with tsx, so it needs no build |
| YAML | `yaml` package with the YAML 1.2 core schema (keeps key order and comments) |
| Validation | JSON Schema as source of truth, Ajv 2020; `format` keywords are annotations and rule V15 checks URLs, dates and durations, so `ajv-formats` isn't used (D26); TypeScript types generated with `json-schema-to-typescript` |
| Enforcement | Claude Code PreToolUse hook, packaged as a Claude Code plugin (D17) |
| MCP | Official TypeScript SDK, `@modelcontextprotocol/sdk`, when the MCP server is built |
| Website | Astro static site, Pagefind search, Cloudflare Pages |
| Probes | Cloudflare Workers, KV, Email Routing (Wrangler), for providers whose own APIs can't act as observers |
| Accounts and billing | Not planned: no self-serve tiers, hosted API or billing build (D19) |
| Monitoring | Sentry and PostHog free tiers for the site; no telemetry code in the hook or plugin |

## Names

| Where | Name |
| --- | --- |
| Domain | palin.dev |
| Handle everywhere else | `palindev` (D20) |
| npm | org and scope `@palindev` (`palin` and the `@palin` org are taken) |
| CLI binary | `palin` |
| PyPI | `palindev` (`palin` is taken); PyPI names are taken by a first real upload, not reserved |
| GitHub | org `palindev` (to be claimed); the repo is currently [TheophilusJohn/palindev](https://github.com/TheophilusJohn/palindev) (public) |

Copy pairs the name with a descriptor. A two-hour name clearance check runs before the first npm publish; rename only if it finds a conflict (D20).

## CI workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | Every push and PR | install, typecheck, validate, unit tests, mock action tests, bundle build |
| `site.yml` | Push to `main` | Build and deploy the site (weeks 9 to 12) |
| `verify-scheduled.yml` | Weekly cron on `main` (deferred) | Sandbox runs, commits traces and evidence through a PR |
| `drift-watch.yml` | Daily cron (deferred) | Fetch provider changelogs, open a drift PR or issue when something relevant changed |

`verify-scheduled.yml` and `drift-watch.yml` wait until a paying customer needs a freshness commitment. Until then, drift is triaged by hand with `/triage-drift`, and sandbox runs happen only on the maintainer's machine. Once `verify-scheduled.yml` exists, sandbox secrets live only in its environment, never in `ci.yml`.

## Environments and secrets

- Local secrets file: `.env.sandbox` (gitignored). Its shape is documented in `sandbox.env.example`.
- Claude Code's Read and Edit tools are denied `.env` files, `~/.aws/**`, `~/.ssh/**`, `**/*.pem`, `**/*.key` and the other local credential stores in `.claude/settings.json`. Those stores are the gh, Stripe and wrangler logins, the user `.npmrc`, `.netrc`, git credentials, kubeconfig, the Docker and PyPI configs, `~/.claude.json`, `~/.claude/backups`, Claude's credentials file and the Claude Desktop and Cursor MCP configs. Settings also deny `stripe` commands and ask before any `aws` command. They deny the Slack, Notion and Stripe MCP servers by URL, which holds in terminal sessions but not in cloud sessions (the proxy rewrites connector URLs) or the desktop app's local sessions, so disconnect those connectors at claude.ai. The guard hook (on Bash, Edit, Write, MultiEdit and NotebookEdit) blocks common shell commands that would read or print secrets. It also blocks:
  - any Bash command that names an `.aws` or `.ssh` directory or one of those credential stores (or the env vars that relocate them), whatever the command, and a grep, rg, ag or ack that searches the home directory, `~/.config`, `~/.claude` or `~/Library`, or a glob straight under one, anywhere after its pattern;
  - commands that print a stored credential (`gh auth token`, git credential helpers, the macOS keychain, Docker credential helpers, npm tokens, `wrangler auth token`, `kubectl config view --raw`, `claude mcp get`);
  - the Stripe CLI and its Docker image at the start of a command, through wrappers such as `sudo`, `xargs` or `npx`, or inside `sh -c`, until Stripe's terms are green (D13). The quoted heredoc body of a `git commit`, `tag` or `merge`, or a `gh pr`, `issue` or `release`, is skipped for this rule and the push rules, since it is never run. The skip applies only to a line with exactly one heredoc outside any comment, and no here-string or process substitution, and it ends no later than zsh or a current bash ends the body (bash 3.2's handling of a quoted paren inside `$( )` isn't followed). Line continuations are joined the way the shell joins them, so a backslash at the end of a comment doesn't hide the next line;
  - edits to `.env` files and to files named like those stores, wherever they are;
  - reading `$AWS_SHARED_CREDENTIALS_FILE`, `$AWS_CONFIG_FILE` or private key files (`.pem`, `.key`, `.p12`);
  - AWS CLI calls that print credentials or secrets, with or without global flags before the service;
  - temporary AWS key ids, secret access keys and session tokens in content;
  - force-pushes (including bundled `-f` flags and a `+refspec`), pushes that name an `embargo/` branch or use a wildcard refspec, and `git push --all`/`--mirror`, also after git's own options such as `-C <dir>`; and any push while an `embargo/` branch is checked out in the session's directory or wherever the command points it with `cd`, `pushd`, `git -C`, `--git-dir` or `GIT_DIR`. When a pushing command moves in a way the guard can't follow (a variable, a subshell, more than 16 moves, unknown git options), it blocks if any checkout or linked worktree of the repo is on an `embargo/` branch. It reads `HEAD` from the repo's files and runs no git process, so a binary in a directory the command names never runs before approval (D22).

  It blocks commands that only mention these paths or commands too (greps, commit messages, heredocs): reword them (for example "the AWS config directory", or search for `\.aws`) instead of working around the guard. Claude Code lets a command through when a hook times out, so the guard checks each command under a 4-second limit and blocks one it can't finish. The newer patterns avoid catastrophic backtracking; a few older ones scan to the next `;`, `&` or `|`, and the limit catches what they can't finish. The tests are in `.claude/hooks/test/`. These are guardrails, not a sandbox: they catch mistakes, not a determined bypass. Splitting a name with quotes, gluing a pipe to a word (`ids|stripe`), capitalising a command name (macOS file names ignore case), reaching a CLI through a variable, alias or `| sh`, nesting a commit heredoc inside an executed multi-line string, a `cd` the guard can't follow (in a subshell, through a variable or a glob) into a separate clone on an embargo branch, or searching a parent directory under another name gets past them. For stronger isolation, turn on Claude Code's sandboxing for Bash once the build is stable.
- The harness loads `.env.sandbox` only in sandbox mode, after preflight.
- AWS sandbox (D14): a dedicated member account in an AWS Organization, never the management account (service control policies don't apply there). Its service control policy allows only the services under test in one region, allows `sts:GetCallerIdentity` and `organizations:DescribeOrganization` in every region, and denies leaving the Organization and creating IAM users or access keys, so the harness uses temporary credentials or keys created before the policy is attached; it also has a budget alarm, `palin-test-` names and a teardown script. Its account id and Organization id (`AWS_SANDBOX_ORG_ID`) are the harness tenant allowlist for AWS: preflight checks them with STS `GetCallerIdentity` and `DescribeOrganization`, refuses the management account, and fails closed on any `DescribeOrganization` error. Every AWS client gets explicit credentials and region from `AWS_SANDBOX_*`, and the harness clears the ambient AWS profile, credential, config-file, endpoint and instance-metadata settings at startup, so it never reads `~/.aws` profiles or instance metadata. The teardown script is a Node entry point that reuses that client and the full preflight, never the AWS CLI. Nothing runs in any other AWS account. Details in the HARNESS [AWS sandbox](HARNESS.md#aws-sandbox-d14) section.
- GitHub sandbox (D25): a test org. The harness acts as a GitHub App registered under that org as private, with exactly one installation, on that org, and observes through one dedicated machine account with a classic token that has only the `notifications` and `read:org` scopes. Neither is the maintainer's personal account: the client hard-codes a denylist of logins (the maintainer's personal account and the real `palindev` org) and preflight refuses if the sandbox org, the installation account or the observer login is on it. The client allows only paths under `/repos/<test-org>/` or `/orgs/<test-org>/`, plus a short list of owner-less App and observer calls, and refuses `/graphql` and id-based routes; the observer client sends GET requests only. Details in the HARNESS [GitHub sandbox](HARNESS.md#github-sandbox-d25) section.
- Everything runs on the maintainer's own accounts and hardware, never on university systems.
