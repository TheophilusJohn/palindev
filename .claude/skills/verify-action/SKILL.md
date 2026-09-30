---
name: verify-action
description: Run a Palin action test against the real vendor sandbox and, if it passes, attach the evidence and mark the record tested. Maintainer-triggered only.
argument-hint: <record id> [more ids...]
disable-model-invocation: true
---

# Verify actions in the sandbox

Ids: $ARGUMENTS

This makes real calls to vendor sandboxes. Follow `docs/HARNESS.md`, especially the Safety section.

## Preflight

1. Confirm `packages/harness` exists and `pnpm harness run <id>` passes in mock mode for each id. If mock mode fails, stop and fix that first.
2. **Not a draft.** If a record's `confidence` is `draft`, don't run it: the maintainer reviews and promotes it to `documented` first. `evidence --write` refuses drafts too.
3. **Terms gate.** Read `data/<provider>/_provider.yaml` for each id. If `terms.status` isn't `green` and `terms.consent` is empty, don't run that id; report why (D13, V24). The harness refuses too, but check first.
4. Don't read `.env.sandbox`. If the harness reports missing variables, tell the maintainer which names to set and stop.
5. For AWS ids, confirm with the maintainer that the D14 setup is in place: the dedicated member account in the Organization (never the management account), the service control policy allowing only the services under test in one region (plus `sts:GetCallerIdentity` and `organizations:DescribeOrganization` everywhere), the budget alarm and the teardown script. Have the maintainer approve each billable test's declared worst-case cost (`max_cost`). The harness itself checks only the account id, the Organization id and that the caller isn't the management account, and refuses on any `DescribeOrganization` error.
6. For GitHub ids, confirm with the maintainer that the D25 setup is in place: the App registered under the test org as private with its one installation there, the observer machine account's classic token with only the `notifications` and `read:org` scopes, and public test repos. The harness checks the login denylist, the single installation, the observer's login and orgs, and the allowed routes.
7. Tell the maintainer which provider accounts each run will touch, observer accounts included, then run.

## Run

For each id: `pnpm harness run --sandbox <id>` (this asks for permission; that is intended).

## Interpret

- **pass** (observed class equals expected, expected residue seen): first check for a contradiction. If the run saw residue the record doesn't list, the harness keeps its trace in `runs/raw/`; if the trace otherwise contradicts the docs, move it there yourself. In either case don't run `--write`: handle the trace and any record change under D22 as in **fail**, and wait for the maintainer's decision. Otherwise, run `pnpm harness evidence <run_id> --write`, which adds the `sandbox_run` item with `tested_on`, sets `last_verified`, and sets `observed_by` on the residue items the run saw. Check that `tested_on` names the plan and variant you expected. Set `confidence: tested` only when the run's observed class equals the record's top-level `class` (V3); a variant run alone adds evidence for that variant. Then run `pnpm validate <file>`.
- **fail** (observed class differs; the trace is in `runs/raw/`): don't change the class to match silently. Report expected versus observed, the diff and the residue events. Propose the corrected record, following D22: commit a doc-contradicting change only on a separate local-only branch `embargo/<YYYY-MM-DD>-<id>`, never on the batch branch that gets pushed for its PR (the guard refuses any push while an `embargo/` branch is checked out and any push that names an `embargo/` ref); its trace joins that branch only after the maintainer releases it from `runs/raw/`, and keep a security-relevant trace in `runs/raw/` and its proposed change in `private/disclosures/`, out of tracked files. If the result contradicts the vendor's docs, it follows D13: draft a right-of-reply email in `private/right-of-reply/<YYYY-MM-DD>-<id>.md`, or, for a security issue, a report for the vendor's disclosure program in `private/disclosures/<YYYY-MM-DD>-<id>.md` (never in `content/` or any tracked file), for the maintainer to send, and don't contact the vendor. `/write-finding` can draft the post, but it's published only after the 14-day reply window closes.
- **inconclusive**: report which step or probe errored and what to fix. Leave the record unchanged.

Channels no probe could see are listed in the trace's `unobserved_channels`. Residue on them stays `observed_by: doc`; never read silence there as "nothing escaped".

Always confirm cleanup ran. If a fixture was left behind, list its ids so the maintainer can remove it (for AWS, with the teardown script).

Re-verification is manual until scheduled runs are built (deferred; see the After launch table in `docs/ROADMAP.md`). A tested record whose newest passing run is more than 90 days old compiles as `tested_stale`; running this skill again refreshes it.

## Report

A table: id, result, expected class, observed class, residue seen (with `observed_by`), unobserved channels, `tested_on`, run id, trace path, record changes made. List any ids the terms gate skipped, and why.
