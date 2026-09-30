---
name: triage-drift
description: Check a vendor changelog or docs change for effects on Palin records and draft the updates. Use when a provider changelog, API version, deprecation notice, docs or policy page change, or a release of the vendor's official MCP server or CLI comes up.
argument-hint: <provider> <changelog URL or pasted diff>
---

# Triage vendor drift

Input: $ARGUMENTS

1. Read `data/<provider>/_provider.yaml` and list the provider's records (`data/<provider>/*.yaml`).
2. Have the `doc-researcher` subagent read, for the period since the provider's `last_reviewed` date:
   - the changelog entries;
   - release notes for the vendor's official MCP server and CLI, looking for tool or command renames, removals and consolidations (for example, several tools merged into one that takes a `method` argument, or into a generic `*_api_write` tool);
   - the unversioned policy pages the records cite, such as retention, notification and trash-window pages, and the terms page. These change without a changelog entry. `pnpm validate --quotes` (V23) lists doc quotes that no longer appear on their page.

   It returns each change that touches: reversal or undo endpoints, deletion or retention windows, notifications or emails, webhooks, idempotency, required scopes, the API version, MCP tool or CLI command names, or the terms. Each change is labeled `announced`, `effective` or `reverted` (with dates), and `preview` or `GA`.
3. Match each change to records by `operation`, `mcp_tool_aliases` and `cli_aliases`. For each affected record, decide:
   - **No effect:** note it in the report only.
   - **Evidence update:** add the new doc evidence; keep the class.
   - **Alias update:** a tool or command was renamed or consolidated. Add the new alias, with `match` for a tool that dispatches on an argument or `operation_from_args` for a generic tool (see `docs/SCHEMA.md`). Don't drop the old alias silently: older releases may still use it, and a dropped alias makes that tool unknown to the hook. Give the reason in the PR description.
   - **Behavior change:** draft the corrected fields, set `confidence: draft`, remove `last_verified` (V6), and add `Open question: re-verify after <change>` to `notes`. New or changed residue items get `observed_by: doc`. Flag the record for `/verify-action`. In the PR description, say the record must be re-promoted before merge: drafts are left out of the bundle, so the hook would stop asking about the action (D16, D24).

   Records describe behaviour in effect. An `announced` change goes in the report and in an `Open question:` line with its effective date; a `reverted` change undoes any draft made for it. For a `preview` change, say which accounts get it; if a `settings` or `plan` condition describes them, draft it as a variant. A changed terms page gets quoted evidence. If it is less permissive, set `terms.status: red` (lowering is always allowed, D23), put the reason and quotes in `terms.notes`, and say so at the top of the report and the PR description so the maintainer re-rates it. Never raise it or fill `terms.consent`.
4. Update `current_api_version` and `last_reviewed` in `_provider.yaml`.
5. Run `pnpm validate` and the `adversarial-reviewer` on each changed record.
6. Commit on `drift/<provider>-<YYYY-MM-DD>` and write a PR description to `content/drift/<provider>-<YYYY-MM-DD>.md`: what changed at the vendor (with its announced, effective or reverted and preview or GA labels), which records changed and why, and which need re-verification. Don't push or open the PR.
