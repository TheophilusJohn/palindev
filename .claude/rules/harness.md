---
paths:
  - "packages/harness/**"
  - "tests/actions/**"
  - "apps/probes/**"
  - "runs/**"
---

# Rules for the harness, action tests, probes and traces

- Follow `docs/HARNESS.md`. The Safety table is mandatory, not optional.
- Mock mode is the default and must need no network or credentials. Every action test must pass in mock mode in CI.
- Sandbox mode is only run by the maintainer (`/verify-action`). Don't run `--sandbox` yourself unless asked in this session.
- Secrets come only from `process.env`. Never log them, never put them in traces, fixtures, snapshots or error messages.
- Everything a test creates is named `palin-test-…` and cleaned up in `cleanup`, which must run even after failures.
- Update and delete calls may only target ids created in the same run.
- Traces in `runs/` are redacted before hashing; never edit a committed trace (its hash is evidence).
- A mock result is never evidence. Only sandbox runs produce `sandbox_run` items.
- Changes here get a `security-reviewer` pass before commit.
