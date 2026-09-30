---
name: add-action
description: Draft new Palin records and harness test stubs for vendor API actions, with cited evidence. Use when asked to add, draft, cover or research one or more actions for a provider (e.g. "add Stripe refunds", "cover the GitHub branch actions").
argument-hint: <provider> <operation or docs URL> [more operations...]
---

# Add actions

Arguments: $ARGUMENTS
The first argument is the provider id; the rest are operations (for example `POST /v1/refunds`, a tool name, or a docs URL).

## Before starting

1. Read `docs/SCHEMA.md` (classes, decision guide, fields, rules) and `docs/HARNESS.md` (test format).
2. If `data/<provider>/_provider.yaml` doesn't exist, create it from `docs/templates/provider.yaml`, citing the vendor's docs for every value.
3. For each operation, check it isn't already covered: search `data/<provider>/` for the same `operation.path` or alias. Skip duplicates and say so.
4. More than 5 operations: show the list with proposed ids and wait for approval. Then work in batches of up to 5: start up to 5 `doc-researcher` subagents at once from this session, write those records, then start up to 5 `adversarial-reviewer` subagents at once. Each record is its own file, so one branch is enough; no worktrees needed.

## For each operation

1. **Research.** Delegate to the `doc-researcher` subagent with the provider, the operation and these questions:
   - What exactly does the call change, and who can see the change?
   - Is there a documented way to reverse it? Which call or UI path? Does it restore the exact prior state?
   - Is there a time limit on reversal (trash retention, recall window)?
   - What is sent or recorded when it runs: emails, notifications, webhooks and events, audit log entries, fees, copies in other systems?
   - Idempotency: natural, key-based, or none? Required scopes or admin rights?
   - Which MCP servers expose it, and under what tool names?
   It must return a fact sheet where every fact has a URL, a verbatim quote (40 words max) and the date retrieved, plus a list of questions the docs don't answer.
2. **Classify.** Walk the decision guide in `docs/SCHEMA.md` using only the fact sheet. On a tie, pick the stricter class and say why in `notes`.
3. **Write the record** at `data/<provider>/<resource>.<verb>.yaml` from `docs/templates/action.yaml`:
   - `confidence: draft`, no `last_verified`.
   - Only facts from the fact sheet. A field you can't support is left out, with a `todo` evidence item naming it in `field` (rule V19) and an `Open question:` line in `notes`.
   - Set `suggested_annotations` and `recommended_policy` from the mapping and minimums in `docs/SCHEMA.md`.
4. **Write the test stub** at `tests/actions/<provider>/<resource>.<verb>.action.ts` from `docs/templates/action.action.ts.tmpl`, with `expect.class` equal to the record's class, observable residue in `expect.residue`, and doc-only residue and windows in `expect.documented_residue` and `expect.window`. Skip the stub if the action can't be exercised in a sandbox, and note why in the record.
5. **Validate:** `pnpm validate data/<provider>/<file>`. Fix every error. (If `pnpm validate` doesn't exist yet, check the rules in `docs/SCHEMA.md` by hand.)
6. **Review:** run the `adversarial-reviewer` subagent on the record. Fix what it proves wrong. Anything it raises that you can't settle goes into `notes` as an open question.

## Finish

- Commit on a branch named `data/<provider>-batch-<n>` with messages like `data(<provider>): add <resource>.<verb>`. Don't push.
- Report a table: id, class, recommended policy, number of evidence items, open questions, reviewer verdict.
- Never set `documented` or `tested` yourself.
