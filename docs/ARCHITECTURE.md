# Architecture

A TypeScript monorepo where the Git repo is the database. YAML records compile into one versioned bundle that the website, API, MCP server, CLI and SDKs all read.

## Data flow

```
vendor docs ──► doc-researcher ──► record-drafter ──┐
changelogs ───► triage-drift ───────────────────────┤
sandbox ──────► harness runs ──► evidence ──────────┼──► pull request ──► review ──► data/ (main)
community ───────────────────────────────────────────┘      (adversarial-reviewer, CI validate)
                                                                                  │
                                                                     CI build: bundle (JSON, later SQLite)
                                                                                  │
                                   ┌──────────────┬──────────────┬───────────────┼──────────────┐
                                 site          public API     MCP server       CLI (lint)      SDKs
```

## Repository layout

```
palin/
├── CLAUDE.md
├── README.md
├── docs/                       # SPEC, SCHEMA, HARNESS, ARCHITECTURE, ROADMAP, PROMPTS, DECISIONS, templates/
├── data/<provider>/            # _provider.yaml and <resource>.<verb>.yaml (CC BY-SA 4.0)
├── runs/YYYY/MM/               # redacted harness traces
├── tests/actions/<provider>/   # one *.action.ts per record
├── packages/
│   ├── schema/                 # record.schema.json, generated types, rules V1-V19, `palin-validate` bin
│   ├── core/                   # load records, compile bundle, staleness, tool-to-record matching
│   ├── harness/                # defineActionTest, runner, probes, provider clients and mocks
│   ├── mcp-server/             # @palindev/mcp
│   ├── cli/                    # @palindev/cli, binary `palin` (lint, check, validate)
│   └── sdk-ts/                 # @palindev/sdk
├── apps/
│   ├── site/                   # Astro + Pagefind (week 5)
│   ├── api/                    # Cloudflare Worker (month 3)
│   └── probes/                 # Cloudflare Workers for webhook and mailbox probes (week 3)
├── content/findings/           # drafts of public posts, never auto-published
├── scripts/
└── .github/workflows/          # ci.yml, verify-scheduled.yml, drift-watch.yml
```

`packages/sdk-py/` (PyPI `palindev`) arrives in months 4 to 6.

## Package responsibilities

| Package | Depends on | Exposes |
| --- | --- | --- |
| `schema` | none | JSON Schema, TypeScript types, `validateRecord`, `validateRepo`, CLI `palin-validate [files]` |
| `core` | `schema` | `loadRepo`, `compileBundle`, `effectiveConfidence`, `matchTool`, `minPolicy` |
| `harness` | `schema`, `core` | `defineActionTest`, runner CLI (`pnpm harness …`) |
| `mcp-server` | `core` | stdio server; bundled snapshot |
| `cli` | `core` | `palin lint`, `palin check`, `palin validate` |
| `sdk-ts` | `core` | `guard`, `lookup`, policy types |

Rule: surfaces never read YAML directly. They read the compiled bundle through `core`.

## Bundle

`pnpm build:bundle` writes `dist/bundle/palin-YYYY-MM-DD.json`:

```json
{
  "schema_version": "0",
  "generated_at": "2026-10-05T00:00:00Z",
  "providers": [],
  "records": [],
  "alias_index": { "acme/acme-mcp#send_invoice": "acme.invoices.send" },
  "operation_index": { "acme POST /v1/invoices/{}/send": "acme.invoices.send" }
}
```

Each compiled record adds `effective_confidence` and `url`. Drafts are excluded unless `--include-drafts` is passed.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node 22 LTS or newer, ESM only |
| Package manager | pnpm via Corepack, workspaces, Turborepo |
| Language | TypeScript, `strict: true` |
| Tests | Vitest |
| Build | tsup |
| YAML | `yaml` package (keeps key order and comments) |
| Validation | JSON Schema as source of truth, Ajv 2020 with `ajv-formats`; TypeScript types generated with `json-schema-to-typescript` |
| MCP | Official TypeScript SDK, `@modelcontextprotocol/sdk` |
| Website | Astro static site, Pagefind search, Cloudflare Pages |
| API and probes | Cloudflare Workers, KV, Email Routing (Wrangler) |
| Accounts and billing | Basis boilerplate (Express, React, Postgres, Prisma, Stripe) from month 4 |
| Monitoring | Sentry and PostHog free tiers |

## Names

| Where | Name |
| --- | --- |
| Domain | palin.dev |
| npm scope | `@palindev` (`palin` and the `@palin` org are taken) |
| CLI binary | `palin` |
| PyPI | `palindev` (`palin` is taken) |
| GitHub repo | [TheophilusJohn/palindev](https://github.com/TheophilusJohn/palindev) (public) |

## CI workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | Every push and PR | install, typecheck, validate, unit tests, mock action tests, bundle build |
| `verify-scheduled.yml` | Weekly cron on `main` (nightly for the top 50 later) | Sandbox runs, commits traces and evidence through a PR |
| `drift-watch.yml` | Daily cron | Fetch provider changelogs, open a drift PR or issue when something relevant changed |
| `site.yml` | Push to `main` | Build and deploy the site |

Sandbox secrets live only in the environment used by `verify-scheduled.yml`.

## Environments and secrets

- Local secrets file: `.env.sandbox` (gitignored). Its shape is documented in `sandbox.env.example`.
- Claude Code's Read and Edit tools are denied `.env` files, `~/.aws` and `~/.ssh` (`.claude/settings.json`), and the guard hook blocks common shell commands that would read or print secrets. These are guardrails, not a sandbox: they catch mistakes, not a determined bypass. For stronger isolation, turn on Claude Code's sandboxing for Bash once the build is stable.
- The harness loads `.env.sandbox` only in sandbox mode, after preflight.
- Everything runs on the maintainer's own accounts and hardware, never on university systems.
