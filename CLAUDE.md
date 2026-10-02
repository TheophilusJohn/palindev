# Palin

An open, tested database of whether AI agent actions on SaaS APIs can be undone, how, for how long, and what escapes first. Records are YAML in `data/`; every surface (a Claude Code PreToolUse hook and the site first; MCP server, CLI and SDKs later) reads a bundle compiled from them.

## Read before working

- `docs/ROADMAP.md`: the current week and what's left. Tick boxes as work lands.
- `docs/SCHEMA.md`: before touching anything in `data/` or `packages/schema`.
- `docs/HARNESS.md`: before touching `packages/harness`, `tests/actions` or `runs/`.
- `docs/SPEC.md`: before building a user-facing surface.
- `docs/ARCHITECTURE.md`: package boundaries and stack.
- `docs/DECISIONS.md`: settled choices. Don't relitigate them silently; propose a new entry instead.
- Business material (offers, prices, go/no-go criteria, buyer lists) lives in `private/PLAN.md`, which is gitignored (D21). Tracked files may point to it; never copy its contents into them, or into commits or PRs.

## Commands

Some of these don't exist yet; `docs/ROADMAP.md` says when each lands.

- `pnpm install`
- `pnpm validate [files...]`, `pnpm validate --root <dir>`, `pnpm validate --fix`, `pnpm validate --quotes` (network quote check, V23)
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:bundle`
- `pnpm harness run <id>` (mock), `pnpm harness run --sandbox <id>` (real sandbox calls; maintainer only)
- `pnpm harness evidence <run_id> [--write]`

## Non-negotiable rules

1. **Evidence or nothing.** Every factual field in a record is backed by an `evidence` item (a doc URL with a short quote, or a sandbox run). If you can't find evidence, leave the field out of the draft, name it in a `todo` evidence item (rule V19), and add `Open question: …` to `notes` (for records; provider files have no draft state, so stop and ask instead). Never fill a gap from memory.
2. **Confidence only moves up with proof.** Anything you draft is `draft`. Promote `draft` to `documented` only when the maintainer names the reviewed ids in this session. `tested` requires a passing `sandbox_run` from the harness, never from a mock. Fictional fixtures under `packages/*/test/fixtures/` are exempt from this rule and D23: they may set any confidence, `terms.status` or `terms.consent`, and their `sandbox_run` items are fictional.
3. **Sandbox only.** Never use live keys, production tenants, real money or real people's data. If an action can only be tested in production, don't write the test; the record stays `documented`. For AWS, a sandbox is a dedicated member account (never the management account) in an AWS Organization with a service control policy allowing only the services under test and preflight's identity checks, a budget alarm, `palin-test-` names and a teardown script; its account id and Organization id are the tenant allowlist (D14). On GitHub, the harness acts only as a private GitHub App installed on the test org and observes through one dedicated machine account; never the maintainer's personal account or token (D25). Terms gate (D13, V24): unless a provider's `terms.status` is `green` or written consent is on file, write no action tests, mocks or sandbox clients for it, run nothing in its sandbox, keep its records below `tested`, and draft no findings about it. Slack, Notion and Microsoft are red today.
4. **Secrets stay secret.** Never read `.env` files, print environment variables, or put keys or tokens in any file, log, trace or commit. Code reads secrets from `process.env` only.
5. **No outside contact.** Don't open PRs or issues on other repos, post, comment, email or publish packages without the maintainer's explicit go-ahead in this session. Draft them into `content/` (public), or into `private/` for business material and anything a vendor must see first (right-of-reply emails, disclosure reports).
6. **Stricter when unsure.** When two classes fit, pick the stricter one and explain why in `notes`.
7. **Never weaken a record silently.** Lowering a class, removing residue or deleting evidence needs a stated reason in the PR description. So does adding or changing a variant that is weaker than the top level, since it lowers the answer for those calls.

## How work gets done

- Weeks 1 to 4 are a validation phase (D10): build only what `docs/ROADMAP.md` lists for them. Draft outreach for the maintainer to send: public drafts into `content/`, business drafts (messages, call scripts, audits) into `private/`.
- New actions: `/add-action <provider> <operations…>`. Research goes through the `doc-researcher` subagent; every new or changed record gets an `adversarial-reviewer` pass before commit.
- Batches: list the proposed actions first and wait for approval. Then run up to 5 `doc-researcher` subagents at once from the main session, write the records, and run the reviewers the same way. One branch and PR per provider batch. Use worktrees only for parallel code work, not for records.
- Tests may contain fake secrets only if the line says `FAKE` (for example `sk_test_FAKE…`).
- Sandbox verification: `/verify-action <id>`, triggered by the maintainer only.
- Vendor changes: `/triage-drift`. MCP server audits: `/lint-server`. Public posts: `/write-finding` (drafts only).
- Harness, hook or plugin, workflow or auth code changes get a `security-reviewer` pass.

## Conventions

- TypeScript strict, ESM, Node 22+, pnpm workspaces. Tests with Vitest next to each package in `test/`.
- Surfaces never read YAML directly; they go through `packages/core`.
- Record files: `data/<provider>/<resource>.<verb>.yaml`, keys in the order in `docs/SCHEMA.md`.
- Dates `YYYY-MM-DD`; durations ISO 8601 (`P30D`); URLs `https://` only.
- Commits: conventional style with a scope, e.g. `data(stripe): add refunds.create`, `feat(schema): rule V9`, `fix(harness): redact cookies`.
- Branches: `data/<provider>-batch-<n>`, `drift/<provider>-<YYYY-MM-DD>`, `feat/<topic>`, `fix/<topic>`, and `embargo/<YYYY-MM-DD>-<id>` (local only, never pushed; D22).

## Definition of done

`pnpm validate`, `pnpm typecheck` and `pnpm test` pass; docs changed if behavior changed; the matching `docs/ROADMAP.md` box is ticked; a one-paragraph summary of what changed and what's left.

## Hooks in this repo

`.claude/settings.json` runs three hooks (Node scripts in `.claude/hooks/`): a guard, a validator that runs after edits to `data/`, and a stop check that runs validate and tests when relevant files changed.

The guard blocks commands and edits that contain secrets (API keys and tokens, AWS key ids, secret access keys and session tokens, private keys). It also blocks commands that read `.env` files, print environment variables, name an `.aws` or `.ssh` directory, read `$AWS_SHARED_CREDENTIALS_FILE`, `$AWS_CONFIG_FILE` or a private key file (`.pem`, `.key`, `.p12`), print credentials or secrets through the AWS CLI, force-push, push while an `embargo/` branch is checked out or name one in a push, or push `--all`/`--mirror` (D22). It matches mentions too, so a grep, commit message or heredoc that only names such a path or AWS command is blocked: reword it (for example "the AWS config directory", or search for `\.aws`) instead of working around the guard. Settings also deny the Read and Edit tools on `.env` files, `~/.aws/**`, `~/.ssh/**`, `**/*.pem` and `**/*.key`, and ask before any `aws` command.

If a hook blocks you, fix the cause; don't work around it. Set `PALIN_SKIP_STOP_CHECKS=1` only when the maintainer asks.
