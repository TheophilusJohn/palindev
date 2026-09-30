# Verification harness

The harness performs an action in a vendor sandbox, tries the undo, compares state, listens for residue, and writes evidence. It is what turns a `documented` record into a `tested` one, and it is Palin's moat.

## Modes

| Mode | Command | Network | Produces evidence |
| --- | --- | --- | --- |
| Mock (default) | `pnpm harness run <id>` | None; in-memory provider mocks | No |
| Sandbox | `pnpm harness run --sandbox <id>` | Real vendor sandbox | Yes |

CI runs every action test in mock mode on every PR. Sandbox runs happen only on the maintainer's machine or in the scheduled workflow on `main`, never on pull requests.

## One run, step by step

1. **Preflight:** check the kill switch, credentials, key prefixes and tenant allowlist (see [Safety](#safety)).
2. **Seed:** create the fixtures the action needs. Every created object's name starts with `palin-test-` and its id is added to the run's created set.
3. **Snapshot before:** capture the relevant state as plain JSON.
4. **Start probes:** webhook, mailbox, observer, ledger, as the test requests.
5. **Act:** call the action. Destructive calls may only target ids in the created set.
6. **Snapshot after act:** a diff equal to zero means the action changed nothing (R0 candidate).
7. **Undo:** call the candidate undo, if the test defines one.
8. **Snapshot after undo:** compare to the before snapshot, ignoring volatile fields.
9. **Collect residue:** stop probes and gather events tied to this run.
10. **Classify:** compute `observed_class` with the decision guide in [SCHEMA.md](SCHEMA.md#how-to-pick-a-class), from the observed diffs and residue plus any `expect.window` and `expect.documented_residue` the test declares from doc evidence. The trace marks those declared inputs `source: doc`, so a reader can see what was observed and what was taken from docs.
11. **Write the trace:** redact, canonicalize, hash (SHA-256) and save to `runs/YYYY/MM/<run_id>.json`.
12. **Cleanup:** delete fixtures, even when a step failed.

`result` is `pass` when `observed_class` equals `expect.class` and the expected residue kinds were seen; `fail` when they differ; `inconclusive` when a probe or step errored.

## Test file format

One file per record, mirroring the data path: `tests/actions/<provider>/<resource>.<verb>.action.ts`.

```ts
import { defineActionTest } from "@palindev/harness";

export default defineActionTest({
  id: "acme.invoices.send",
  environment: "test_mode",
  seed: async ({ acme, probes }) => {
    const customer = await acme.customers.create({
      name: "palin-test-customer",
      email: probes.mailbox.address("customer"),
    });
    const invoice = await acme.invoices.create({ customer: customer.id, amount: 100 });
    return { customerId: customer.id, invoiceId: invoice.id };
  },
  snapshot: async ({ acme }, fx) => acme.invoices.get(fx.invoiceId),
  ignore: ["updated_at", "etag"],
  act: async ({ acme }, fx) => acme.invoices.send(fx.invoiceId),
  undo: async ({ acme }, fx) => acme.invoices.void(fx.invoiceId), // or null when no undo is expected
  probes: ["mailbox", "webhook"],
  expect: {
    class: "R3",
    residue: ["email", "webhook"],        // kinds a probe must observe
    documented_residue: [],               // kinds no probe can observe, taken from doc evidence
    window: null,                         // for R4: the doc-cited window or window_condition
  },
  cleanup: async ({ acme }, fx) => acme.customers.delete(fx.customerId),
});
```

The context passed to each step holds one client per provider, named by provider id (`acme` above, `github`, `stripe` and so on), in sandbox or mock form with the same interface, plus `probes`, `log` and `sleep`.

Fake secrets used in tests (for redaction and V16 fixtures) must contain the word `FAKE`, such as `sk_test_FAKE…`. The guard hook blocks any other secret-shaped string.

## Package layout

```
packages/harness/
  src/
    define.ts            # defineActionTest and types
    runner.ts            # lifecycle above
    classify.ts          # observed class from diffs and residue
    trace.ts             # redaction, canonical JSON, hashing
    evidence.ts          # evidence YAML from a trace
    probes/              # webhook, mailbox, observer, ledger
    providers/<provider>/
      client.ts          # thin sandbox client with safety wrappers
      mock.ts            # in-memory mock with the same interface
      snapshot.ts        # optional helpers
  test/                  # Vitest: runner, classify, trace, and every action test in mock mode
tests/actions/<provider>/*.action.ts
runs/YYYY/MM/*.json      # redacted traces committed to the repo
```

## Probes

| Probe | Captures | Implementation |
| --- | --- | --- |
| `webhook` | Events the vendor sends to a registered endpoint | A Cloudflare Worker receiver storing events in KV by run id; Stripe can use `stripe listen` instead |
| `mailbox` | Emails sent to test recipients | Catch-all addresses on a test subdomain (for example `probe.palin.dev`) routed by Cloudflare Email Routing to an Email Worker and stored in KV; `address(tag)` returns a run-specific address |
| `observer` | What another workspace member's client receives | A second test user or app subscribed to the vendor's event stream; a proxy for notifications, since push notifications themselves can't be read |
| `ledger` | Money movement and fees | Provider-specific reads, such as balance transactions in a payment sandbox |

A probe that can't observe something the docs describe leaves that residue at `documented`; the harness never claims to have seen what it couldn't.

## Time windows

Windows of one hour or less are tested at both edges. Longer windows (such as 30-day trash retention) are tested for undo inside the window only; the test declares the doc-cited window in `expect.window`, so an R4 record can still reach `tested`, and the record's `notes` say the window length itself is doc-cited. The same applies to residue no probe can observe, through `expect.documented_residue`.

## Trace format

```json
{
  "run_id": "2026-10-05T14-02-11Z_acme.invoices.send_ab12cd",
  "id": "acme.invoices.send",
  "date": "2026-10-05",
  "environment": "test_mode",
  "harness_version": "0.1.0",
  "api_version": "2026-09-01",
  "steps": [{ "name": "act", "request": { "method": "POST", "path": "/v1/invoices/{id}/send" }, "status": 200, "duration_ms": 312 }],
  "hashes": { "before": "…", "after_act": "…", "after_undo": "…" },
  "diff_after_undo": [],
  "residue_events": [{ "probe": "mailbox", "kind": "email", "at": "2026-10-05T14:02:13Z", "summary": "Invoice email to customer" }],
  "expected_class": "R3",
  "observed_class": "R3",
  "result": "pass"
}
```

Redaction removes authorization headers, cookies, tokens, keys and any secret-looking string before hashing. The hash covers the redacted, canonical JSON, so anyone can recompute it from the committed trace.

`pnpm harness evidence <run_id>` prints the matching `sandbox_run` evidence item; `--write` adds it to the record and sets `last_verified`.

## Safety

| Guard | Rule |
| --- | --- |
| Opt-in network | Sandbox mode needs the `--sandbox` flag; the default is mock |
| Kill switch | `PALIN_HARNESS_DISABLED=1` stops every run at preflight |
| Key prefixes | Where a vendor has test-key prefixes, clients reject anything else (for example, Stripe keys must start `sk_test_` or `rk_test_`). Vendors without them (GitHub, Slack, Notion, Linear) rely on the tenant allowlist |
| Env loading | Mock mode never loads `.env.sandbox`; sandbox mode loads it only after the `--sandbox` flag and kill-switch checks pass |
| Live-mode check | Any response that reports live mode aborts the run |
| Tenant allowlist | At preflight, credentials must resolve to the allowlisted sandbox account, org or workspace from `.env.sandbox` |
| Created-set rule | Update and delete calls may only target objects created in the same run |
| Name prefix | Everything created is named `palin-test-…` |
| Rate limit | One request per second per provider by default |
| Billable actions | Refused unless `PALIN_ALLOW_BILLABLE=1` and the provider has a spend cap |
| Secrets | Read only from `process.env`, loaded from `.env.sandbox`; never logged, never in traces |
| CI | Sandbox secrets exist only in the scheduled workflow on `main` |

If an action can only be tested with real money or a production account, the test is not written. The record stays at `documented`.
