---
paths:
  - "data/**"
---

# Rules for records in data/

- Follow `docs/SCHEMA.md` exactly: file path, id, key order, enums, date and duration formats.
- Start new records from `docs/templates/action.yaml` and new providers from `docs/templates/provider.yaml`.
- Every factual value needs an `evidence` item that supports it. Doc evidence has a verbatim `quote` of 40 words or fewer and a `retrieved` date.
- Unknown values: leave the field out of the draft, add a `todo` evidence item naming it in `field` (rule V19), and add `Open question: …` to `notes`. Never guess, and never use memory as a source.
- New or agent-edited records are `confidence: draft`. Raise to `documented` only for ids the maintainer names as reviewed in this session; `tested` needs a harness `sandbox_run`.
- Never delete evidence or lower a class without a written reason in the PR description.
- Pick the class with the decision guide in `docs/SCHEMA.md`; on a tie, the stricter class, with the reason in `notes`.
- Keep `suggested_annotations` and `recommended_policy` consistent with the class and flags (rules V13 and V14).
- Only real providers live in `data/`. The fictional `acme` provider is for tests and lives in `packages/*/test/fixtures/`; never copy its facts anywhere.
