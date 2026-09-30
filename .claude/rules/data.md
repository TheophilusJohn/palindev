---
paths:
  - "data/**"
---

# Rules for records in data/

- Follow `docs/SCHEMA.md` exactly: file path, id, key order, enums, date and duration formats.
- Start new records from `docs/templates/action.yaml` and new providers from `docs/templates/provider.yaml`.
- Every factual value needs an `evidence` item that supports it. Doc evidence has a verbatim `quote` of 40 words or fewer and a `retrieved` date; `pnpm validate --quotes` checks that the quote is on the page (V23).
- Unknown values: leave the field out of the draft, add a `todo` evidence item naming it in `field` (a dotted path such as `undo.window` for a sub-key; rule V19), and add `Open question: …` to `notes`. Never guess, and never use memory as a source. On non-drafts every key of `flags` and `undo` and all four `suggested_annotations` hints are present; write `null` or `[]` where there is none.
- Files are YAML 1.2 (core schema). Quote `api_version`, `current_api_version`, `trace_sha256`, `idempotent: "no"` and yes, no, on or off values in `settings`.
- `operation`: `service` (lowercase, such as `s3`) is required for `aws`; `method` only for `http`; for `graphql`, `path` is the root field name, query or mutation.
- New or agent-edited records are `confidence: draft`. Raise to `documented` only for ids the maintainer names as reviewed in this session; `tested` needs a harness `sandbox_run` and a provider whose `terms.status` is `green` or whose `terms.consent` is filled (V24). You may set `terms.status` only to `red`: as a placeholder, with your proposed rating and quoted evidence in `terms.notes`, or to lower a rating when terms tighten (say so at the top of the PR description). Only the maintainer raises it to `yellow` or `green` or fills `terms.consent` (D23). `yellow` records stay `documented`.
- Never delete evidence or lower a class without a written reason in the PR description.
- Pick the class with the decision guide in `docs/SCHEMA.md`; on a tie, the stricter class, with the reason in `notes`.
- Keep `suggested_annotations` and `recommended_policy` consistent with the class and flags (rules V13 and V14).
- `variants`: use them when arguments, settings or the plan change the class, residue or undo. The top level describes the default call and must be at least as strict as every variant in `class` and `recommended_policy` (V20); each variant merged over the top level passes V7 to V14. Absent keys inherit and an explicit `null` clears; a variant's `undo`, when set, is a complete undo object. `when.args` names API parameters, not MCP tool arguments or CLI flags. Each variant's `when` and every field it changes need their own evidence, named in `supports` (quote bracketed paths in flow lists: `supports: ["variants[0].when"]`). A variant that drops a residue item must cite evidence that its condition removes it, and a variant weaker than the top level falls under CLAUDE.md rule 7 (never weaken a record silently). Once runs exist for a variant, don't reorder or remove variants; append new ones.
- `flags.modifies_existing`: `true` when the call changes or deletes existing objects or content, `false` when it only creates new ones; always `false` on R0 and R1, since minor R1 metadata (read markers, view counts) doesn't count. For R2 it sets `destructiveHint` (V13).
- `residue[].observed_by` must be honest (V21). Drafts and doc-only items use `doc`. Use `probe` or `proxy` only when the record has a passing `sandbox_run` that captured that channel or a stand-in for it. A silent probe that can't see a channel is not evidence that nothing escaped; the item stays `doc`.
- `approval_text`: required on non-draft R3 to R5 records and on any variant that sets R3 to R5 (V22); an R0 to R2 variant on an R3 to R5 record sets `approval_text: null`. One sentence of 120 characters or fewer saying what escapes and whether it can be undone, not what the tool is called.
- Aliases: give an `mcp_tool_aliases` entry a `match` when the tool dispatches on an argument, or `operation_from_args` when it is a generic API tool, never both; leave both out only when the tool does one thing. Add `cli_aliases` for CLI commands that perform the operation. List in `undo.capture` what the undo needs that can't be looked up later: response fields as JSON paths, and prior values as `{before: {kind, method, path}, field}` items that name the read made before the call.
- `tested_stale` exists only in compiled bundles; never write it in a record file.
- Only real providers live in `data/`. The fictional `acme` provider is for tests and lives in `packages/*/test/fixtures/`, where fixtures may set any confidence or terms (CLAUDE.md rule 2); never copy its facts anywhere.
