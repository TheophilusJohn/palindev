---
paths:
  - "packages/**"
  - "apps/**"
  - "scripts/**"
---

# Rules for code

- TypeScript strict, ESM, Node 22+. No `any` without a comment explaining why.
- Package boundaries follow `docs/ARCHITECTURE.md`. Surfaces (hook, site, MCP server, CLI, SDKs) read the compiled bundle through `packages/core`, never YAML directly.
- Types for records come from the generated schema types; don't hand-write parallel types.
- Every exported function has a Vitest test. Validation rules V1 to V24 each have a passing and a failing case; V23's tests stub the network.
- The Claude Code hook answers `ask` or `deny`, never `allow` (D17).
- Unknown actions: the hook follows D16 (no decision, plus context saying no Palin record exists and to treat the action as irreversible; strict mode answers `ask`). Every other surface treats them as R5 (D8). No surface ever reports an unknown action as safe.
- The bundle carries an expiry date, and expiry never removes a prompt (D24). Past it, the hook keeps answering `ask` or `deny` from the expired records and says the data has expired. Surfaces that can answer permissively (MCP server, SDK) treat every action as unknown (R5).
- `matchTool` evaluates alias `match` and `operation_from_args` matchers, `cli_aliases` and variant `when` conditions. A variant applies only when every condition in its `when` is known to hold; if several apply, the strictest wins. `when.args` is evaluated only against API parameters (an operation match or the request an `operation_from_args` call builds); against an MCP tool's own arguments or CLI flags it counts as unknown. When it can't evaluate a condition, it uses the top-level fields, which are the strictest (V20).
- Palin's own MCP tools are read-only; keep their annotations accurate (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`).
- No new runtime dependency without saying why in the PR description.
