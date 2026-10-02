# @palindev/schema

The JSON Schemas for Palin records and provider files, TypeScript types generated from them, and the offline validator: JSON Schema plus rules V1 to V22 and V24 from [docs/SCHEMA.md](../../docs/SCHEMA.md). V23 checks doc quotes against their pages, so it needs the network and arrives in week 2.

## Files

- `record.schema.json` and `provider.schema.json`: JSON Schema draft 2020-12, the source of truth for structure (D3). `format` keywords are annotations; rule V15 checks URLs, dates and durations.
- `src/generated/`: types from the schemas. Don't edit them; change a schema and run `pnpm --filter @palindev/schema generate`. A test fails while they're stale.
- `src/rules/v1.ts` to `v24.ts`: one function per rule.
- `test/fixtures/`: fictional data roots for the fictional provider Acme Billing. `valid/data` validates clean. Each `invalid/<rule>/data` fails only that rule. `bases/` holds one clean record per class. Fixtures are exempt from CLAUDE.md rule 2 and D23.

## Validate

From the repository root:

```sh
pnpm validate                         # everything in data/
pnpm validate data/github/x.yaml      # only problems in these files; every record still loads (V2, V17)
pnpm validate --root <dir>            # another data root, such as a fixture root
pnpm validate --fix                   # reorder keys and quote values as V18 asks, then validate
```

Each problem prints on one line: `file:line:col  rule  field  message`. The rule id is `schema` for JSON Schema failures, `yaml` for parse errors, or `V1` to `V24`. V18 problems are warnings. Exit codes: 0 no errors (warnings allowed), 1 errors, 2 usage error.

A file with YAML errors gets only `yaml` problems, plus V16 and the directory checks. A file that fails the schema gets `schema` problems plus V1, V2, V16 and V18. The other rules run only on files that pass, so one mistake doesn't cascade.

In the repository, `pnpm validate` runs the TypeScript source with tsx, so it works straight after `pnpm install`. `pnpm build` writes `dist/` with the `palin-validate` bin.

## API

- `validateRepo({ root, now, probeMailDomain, files })`: every problem in a data root.
- `validateRecord(data, { now, provider })`: one record in memory (the schema and the rules that need no files).
- `checkSchema`, `fixText`, `formatProblem`, the schemas and the types.
