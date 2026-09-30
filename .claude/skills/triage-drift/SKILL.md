---
name: triage-drift
description: Check a vendor changelog or docs change for effects on Palin records and draft the updates. Use when a provider changelog, API version, deprecation notice or docs change comes up.
argument-hint: <provider> <changelog URL or pasted diff>
---

# Triage vendor drift

Input: $ARGUMENTS

1. Read `data/<provider>/_provider.yaml` and list the provider's records (`data/<provider>/*.yaml`).
2. Have the `doc-researcher` subagent read the changelog entries since the provider's `last_reviewed` date and return each change that touches: reversal or undo endpoints, deletion or retention windows, notifications or emails, webhooks, idempotency, required scopes, or the API version.
3. Match each change to records by `operation` and alias. For each affected record, decide:
   - **No effect:** note it in the report only.
   - **Evidence update:** add the new doc evidence; keep the class.
   - **Behavior change:** draft the corrected fields, set `confidence: draft`, and add `Open question: re-verify after <change>` to `notes`. Flag the record for `/verify-action`.
4. Update `current_api_version` and `last_reviewed` in `_provider.yaml`.
5. Run `pnpm validate` and the `adversarial-reviewer` on each changed record.
6. Commit on `drift/<provider>-<YYYY-MM-DD>` and write a PR description to `content/drift/<provider>-<YYYY-MM-DD>.md`: what changed at the vendor, which records changed and why, and which need re-verification. Don't push or open the PR.
