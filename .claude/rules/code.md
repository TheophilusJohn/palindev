---
paths:
  - "packages/**"
  - "apps/**"
  - "scripts/**"
---

# Rules for code

- TypeScript strict, ESM, Node 22+. No `any` without a comment explaining why.
- Package boundaries follow `docs/ARCHITECTURE.md`. Surfaces (site, MCP server, CLI, SDKs) read the compiled bundle through `packages/core`, never YAML directly.
- Types for records come from the generated schema types; don't hand-write parallel types.
- Every exported function has a Vitest test. Validation rules V1 to V19 each have a passing and a failing case.
- Unknown actions are treated as R5 on every surface (decision D8).
- Palin's own MCP tools are read-only; keep their annotations accurate (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`).
- No new runtime dependency without saying why in the PR description.
