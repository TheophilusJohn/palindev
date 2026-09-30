# Palin

An open, tested database of whether AI agent actions on SaaS APIs can be undone, how, for how long, and what escapes first. Records are YAML in `data/`; every surface (site, MCP server, CLI, SDKs) reads a bundle compiled from them.

## Read before working

- `docs/ROADMAP.md`: the current week and what's left. Tick boxes as work lands.
- `docs/SCHEMA.md`: before touching anything in `data/` or `packages/schema`.
- `docs/HARNESS.md`: before touching `packages/harness`, `tests/actions` or `runs/`.
- `docs/SPEC.md`: before building a user-facing surface.
- `docs/ARCHITECTURE.md`: package boundaries and stack.
- `docs/DECISIONS.md`: settled choices. Don't relitigate them silently; propose a new entry instead.

## Commands

Some of these exist only after week 1 is built.

- `pnpm install`
- `pnpm validate [files...]`, `pnpm validate --fix`
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:bundle`
- `pnpm harness run <id>` (mock), `pnpm harness run --sandbox <id>` (real sandbox calls; maintainer only)
- `pnpm harness evidence <run_id> [--write]`

## Non-negotiable rules

1. **Evidence or nothing.** Every factual field in a record is backed by an `evidence` item (a doc URL with a short quote, or a sandbox run). If you can't find evidence, leave the field out of the draft, name it in a `todo` evidence item (rule V19), and add `Open question: …` to `notes`. Never fill a gap from memory.
2. **Confidence only moves up with proof.** Anything you draft is `draft`. Promote `draft` to `documented` only when the maintainer names the reviewed ids in this session. `tested` requires a passing `sandbox_run` from the harness, never from a mock.
3. **Sandbox only.** Never use live keys, production tenants, real money or real people's data. If an action can only be tested in production, don't write the test; the record stays `documented`.
4. **Secrets stay secret.** Never read `.env` files, print environment variables, or put keys or tokens in any file, log, trace or commit. Code reads secrets from `process.env` only.
5. **No outside contact.** Don't open PRs or issues on other repos, post, comment, email or publish packages without the maintainer's explicit go-ahead in this session. Draft them into `content/` instead.
6. **Stricter when unsure.** When two classes fit, pick the stricter one and explain why in `notes`.
7. **Never weaken a record silently.** Lowering a class, removing residue or deleting evidence needs a stated reason in the PR description.

## How work gets done

- New actions: `/add-action <provider> <operations…>`. Research goes through the `doc-researcher` subagent; every new or changed record gets an `adversarial-reviewer` pass before commit.
- Batches: list the proposed actions first and wait for approval. Then run up to 5 `doc-researcher` subagents at once from the main session, write the records, and run the reviewers the same way. One branch and PR per provider batch. Use worktrees only for parallel code work, not for records.
- Tests may contain fake secrets only if the line says `FAKE` (for example `sk_test_FAKE…`).
- Sandbox verification: `/verify-action <id>`, triggered by the maintainer only.
- Vendor changes: `/triage-drift`. MCP server audits: `/lint-server`. Public posts: `/write-finding` (drafts only).
- Harness, workflow or auth code changes get a `security-reviewer` pass.

## Conventions

- TypeScript strict, ESM, Node 22+, pnpm workspaces. Tests with Vitest next to each package in `test/`.
- Surfaces never read YAML directly; they go through `packages/core`.
- Record files: `data/<provider>/<resource>.<verb>.yaml`, keys in the order in `docs/SCHEMA.md`.
- Dates `YYYY-MM-DD`; durations ISO 8601 (`P30D`); URLs `https://` only.
- Commits: conventional style with a scope, e.g. `data(stripe): add refunds.create`, `feat(schema): rule V9`, `fix(harness): redact cookies`.
- Branches: `data/<provider>-batch-<n>`, `feat/<topic>`, `fix/<topic>`.

## Definition of done

`pnpm validate`, `pnpm typecheck` and `pnpm test` pass; docs changed if behavior changed; the matching `docs/ROADMAP.md` box is ticked; a one-paragraph summary of what changed and what's left.

## Hooks in this repo

`.claude/settings.json` runs three hooks (Node scripts in `.claude/hooks/`): a guard that blocks commands or edits containing secrets or reading `.env` files, a validator that runs after edits to `data/`, and a stop check that runs validate and tests when relevant files changed. If a hook blocks you, fix the cause; don't work around it. Set `PALIN_SKIP_STOP_CHECKS=1` only when the maintainer asks.
