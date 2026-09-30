---
name: verify-action
description: Run a Palin action test against the real vendor sandbox and, if it passes, attach the evidence and mark the record tested. Maintainer-triggered only.
argument-hint: <record id> [more ids...]
disable-model-invocation: true
---

# Verify actions in the sandbox

Ids: $ARGUMENTS

This makes real calls to vendor sandboxes. Follow `docs/HARNESS.md`, especially the Safety table.

## Preflight

1. Confirm `packages/harness` exists and `pnpm harness run <id>` passes in mock mode for each id. If mock mode fails, stop and fix that first.
2. Don't read `.env.sandbox`. If the harness reports missing variables, tell the maintainer which names to set and stop.
3. Tell the maintainer which provider accounts each run will touch, then run.

## Run

For each id: `pnpm harness run --sandbox <id>` (this asks for permission; that is intended).

## Interpret

- **pass** (observed class equals expected, expected residue seen): run `pnpm harness evidence <run_id> --write`, which adds the `sandbox_run` item and sets `last_verified`. Then set `confidence: tested` and run `pnpm validate <file>`.
- **fail** (observed class differs): don't change the class to match silently. Report expected versus observed, the diff and the residue events. Propose the corrected record, and suggest `/write-finding` if the result contradicts the vendor's docs.
- **inconclusive**: report which step or probe errored and what to fix. Leave the record unchanged.

Always confirm cleanup ran. If a fixture was left behind, list its ids so the maintainer can remove it.

## Report

A table: id, result, expected class, observed class, residue seen, run id, trace path, record changes made.
