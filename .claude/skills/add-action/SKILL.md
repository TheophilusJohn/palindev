---
name: add-action
description: Draft new Palin records and harness test stubs for vendor API actions, with cited evidence. Use when asked to add, draft, cover or research one or more actions for a provider (e.g. "add Stripe refunds", "cover the GitHub branch actions").
argument-hint: <provider> <operation or docs URL> [more operations...]
---

# Add actions

Arguments: $ARGUMENTS
The first argument is the provider id; the rest are operations (for example `POST /v1/refunds`, a tool name, a CLI command, or a docs URL).

## Before starting

1. Read `docs/SCHEMA.md` (classes, decision guide, fields, rules) and `docs/HARNESS.md` (test format).
2. If `data/<provider>/_provider.yaml` doesn't exist, create it from `docs/templates/provider.yaml`, citing the vendor's docs for every value. For `terms`, quote the clauses on benchmarking, publishing results and commercial use in `doc` evidence. Only the maintainer sets `terms.status`: write `red`, put your proposed rating and the reason in `terms.notes`, and say in the report that it needs the maintainer. Provider files have no draft state: if a required value can't be backed by evidence, don't guess or add a `todo`; stop and name the missing keys to the maintainer.
3. For each operation, check it isn't already covered: search `data/<provider>/` for the same `operation`, or the same MCP server and tool where either alias has neither `match` nor `operation_from_args` (V17). Skip duplicates and say so.
4. When proposing or ordering actions, put first the ones agents actually perform, including through CLIs, and destructive ones before the rest.
5. More than 5 operations: show the list with proposed ids and wait for approval. Then work in batches of up to 5: start up to 5 `doc-researcher` subagents at once from this session, write those records, then start up to 5 `adversarial-reviewer` subagents at once. Each record is its own file, so one branch is enough; no worktrees needed.

## For each operation

1. **Research.** Delegate to the `doc-researcher` subagent with the provider, the operation and these questions:
   - What exactly does the call change, and who can see the change?
   - Is there a documented way to reverse it? Which call or UI path? Does it restore the exact prior state?
   - Is there a time limit on reversal (trash retention, recall window)?
   - What is sent or recorded when it runs: emails, notifications, webhooks and events, audit log entries, fees, copies in other systems?
   - Which arguments, account or workspace settings, or plans change what the call does, what escapes, or how and for how long it can be undone?
   - Which values does the undo need that can't be looked up afterwards: response fields (for example the id of a created object), or a prior value, which must be read before the call (name the read call)?
   - Idempotency: natural, key-based, or none? Required scopes or admin rights?
   - Which MCP servers expose it, and under what tool names? Does each tool do only this, dispatch on an argument (which argument and value), or take any method and path?
   - Which CLI commands perform it, including generic API calls (with the method and path)?
   It must return a fact sheet where every fact has a URL, a verbatim quote (40 words max) and the date retrieved, plus a list of questions the docs don't answer.
2. **Classify.** Walk the decision guide in `docs/SCHEMA.md` using only the fact sheet. On a tie, pick the stricter class and say why in `notes`.
3. **Write the record** at `data/<provider>/<resource>.<verb>.yaml` from `docs/templates/action.yaml`:
   - `confidence: draft`, no `last_verified`.
   - Only facts from the fact sheet. A field you can't support is left out, with a `todo` evidence item naming it in `field` (rule V19) and an `Open question:` line in `notes`.
   - `observed_by: doc` on every residue item.
   - `mcp_tool_aliases` and `cli_aliases` only from cited facts. Use `match` for a tool or command that dispatches on an argument and `operation_from_args` for a generic API tool; leave both off only when the tool or command does this one thing.
   - `undo.capture`: what the fact sheet shows the undo needs: response fields as JSON paths, and each prior value as a `{before, field}` item, whose `before` is shaped like `operation` (SCHEMA: `service` for AWS, `method` for HTTP only), naming the read call. Empty if it needs none.
   - `variants` when the fact sheet shows arguments, settings or plans that change the class, residue or undo. The top level describes the call when those are unknown, so it must be at least as strict as every variant (V20). A variant's absent keys inherit and an explicit `null` clears; its `undo`, when set, is a complete undo object. `when.args` names API parameters, not MCP tool arguments or CLI flags.
   - For R3 to R5, and any variant set to R3 to R5, write `approval_text`: one sentence of 120 characters or fewer saying what escapes and whether it can be undone, using only facts already in the record. An R0 to R2 variant on an R3 to R5 record sets `approval_text: null`.
   - Set `suggested_annotations` and `recommended_policy` from the mapping and minimums in `docs/SCHEMA.md`.
4. **Write the test stub.** First check `terms` in `data/<provider>/_provider.yaml` (D13, V24): if `status` isn't `green` and `consent` is empty, skip the stub and note why in the record. Also skip it if the action can't be exercised in a sandbox, and note why in the record. Otherwise write it at `tests/actions/<provider>/<resource>.<verb>.action.ts` from `docs/templates/action.action.ts.tmpl`, with `expect.class` equal to the record's class, observable residue in `expect.residue`, and doc-only residue and windows in `expect.documented_residue` and `expect.window`.
5. **Validate:** `pnpm validate data/<provider>/<file>`. Fix every error. (If `pnpm validate` doesn't exist yet, check the rules in `docs/SCHEMA.md` by hand.)
6. **Review:** run the `adversarial-reviewer` subagent on the record. Fix what it proves wrong. Anything it raises that you can't settle goes into `notes` as an open question.

## Finish

- Commit on a branch named `data/<provider>-batch-<n>` with messages like `data(<provider>): add <resource>.<verb>`. Don't push.
- Report a table: id, class, recommended policy, variants, number of evidence items, test stub (written, or why skipped), open questions, reviewer verdict.
- Never set `documented` or `tested` yourself, never set `terms.status` to anything but `red`, and never fill `terms.consent`.
