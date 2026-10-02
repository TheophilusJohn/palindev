# Verification harness

The harness performs an action in a vendor sandbox, tries the undo, compares state, listens for residue, and writes evidence. It is what turns a `documented` record into a `tested` one, and its published, redacted traces are the receipts for tested records (D11).

## Modes

| Mode | Command | Network | Produces evidence |
| --- | --- | --- | --- |
| Mock (default) | `pnpm harness run <id>` | None; in-memory provider mocks | No |
| Sandbox | `pnpm harness run --sandbox <id>` | Real vendor sandbox | Yes |

Mock runs write traces only to `.harness-tmp/` (gitignored), marked `"mode": "mock"`, and `pnpm harness evidence` refuses them.

CI runs every action test in mock mode on every PR. Sandbox runs happen only on the maintainer's machine, never on pull requests. Scheduled re-verification on `main` is deferred until a paying customer needs a freshness commitment (the After launch table in [ROADMAP.md](ROADMAP.md)). Until then, a tested record whose newest passing run is more than 90 days old compiles as `tested_stale` ([SCHEMA.md](SCHEMA.md#confidence)), and the maintainer re-runs `/verify-action` to refresh it.

## One run, step by step

1. **Preflight:** check the kill switch, the terms gate, credentials, key prefixes and tenant allowlist (see [Safety](#safety)), and load the provider's [capability declaration](#capability-declarations). The runner takes a data root (default `data/`) and a tests root (default `tests/actions/`); harness tests point them at `packages/harness/test/fixtures/data` and `packages/harness/test/fixtures/actions`.
2. **Seed:** create the fixtures the action needs. Every created object's name starts with `palin-test-` and its id is added to the run's created set. A [variant test](#testing-a-variant) also applies the variant's settings here.
3. **Snapshot before:** capture the relevant state as plain JSON. Snapshots stay in memory; only their hashes and field diffs reach the trace.
4. **Start probes:** webhook, mailbox, observer, ledger, as the test requests.
5. **Act:** call the action. Destructive calls may only target ids in the created set.
6. **Snapshot after act:** a diff equal to zero means the action changed nothing (R0 candidate).
7. **Undo:** call the candidate undo, if the test defines one.
8. **Snapshot after undo:** compare to the before snapshot, ignoring volatile fields.
9. **Collect residue:** stop probes and gather events tied to this run. Tag each one `observed_by: probe` or `proxy`, as the capability declaration says for its channel.
10. **Classify:** compute `observed_class` with the decision guide in [SCHEMA.md](SCHEMA.md#how-to-pick-a-class), from the observed diffs and residue plus any `expect.window` and `expect.documented_residue` the test declares from doc evidence. The trace tags declared residue `observed_by: doc` and a declared window `source: doc`, so a reader can see what was observed and what was taken from docs. A missing event counts as "nothing escaped" only on a channel the capability declaration marks `probe`; everywhere else silence proves nothing, and the trace lists those channels as unobserved. A [condition edge](#condition-edges) the test exercised can also set the window condition, tagged `source: run` (D27).
11. **Write the trace:** keep only what [Trace format](#trace-format) allows, then redact, canonicalize and hash (SHA-256). A sandbox `pass` trace is saved to `runs/YYYY/MM/<run_id>.json`. `fail` and `inconclusive` traces are saved to `runs/raw/<run_id>.json` (gitignored), and so is a `pass` trace that shows residue the record doesn't list, until the maintainer decides ([D22](#when-a-run-contradicts-the-docs)). Mock traces go only to `.harness-tmp/`. A trace leaves `runs/raw/` only when the maintainer says so.
12. **Cleanup:** delete fixtures, even when a step failed.

`result` is `pass` when `observed_class` equals `expect.class` and the expected residue kinds were seen; `fail` when they differ; `inconclusive` when a probe or step errored.

## Test file format

One file per record, mirroring the data path: `tests/actions/<provider>/<resource>.<verb>.action.ts`, plus one file per tested [variant](#testing-a-variant). Tests are written only for providers whose terms pass the gate in [Safety](#safety).

```ts
import { defineActionTest } from "@palindev/harness";

export default defineActionTest({
  id: "acme.invoices.send",
  environment: "test_mode",
  variant: null,                          // optional: index into the record's variants; null for the default call
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
  condition_edges: [                      // optional: conditions after which the undo may stop working (D27)
    { name: "invoice paid", apply: async ({ acme }, fx) => acme.invoices.pay(fx.invoiceId) },
  ],
  probes: ["mailbox", "webhook"],
  expect: {
    class: "R3",
    residue: ["email", "webhook"],        // kinds a probe must observe, on channels the capability declaration lists
    documented_residue: [],               // kinds no probe can observe, taken from doc evidence
    window: null,                         // for R4: the doc-cited window or window_condition
  },
  cleanup: async ({ acme }, fx) => acme.customers.delete(fx.customerId),
});
```

A test that makes billable calls also declares `max_cost`, its worst-case cost per run, for the maintainer to approve (see Billable actions in [Safety](#safety)).

The context passed to each step holds one client per provider, named by provider id (`acme` above, `github`, `aws` and so on), in sandbox or mock form with the same interface, plus `probes`, `log` and `sleep`.

Fake secrets used in tests (for redaction tests and the V16 invalid fixture) must contain the word `FAKE`, such as `sk_test_FAKE…`. The guard hook blocks any other secret-shaped string. V16 itself has no FAKE exemption, so a FAKE key under a data root still fails it.

### Testing a variant

`variant` is the index, counted from 0, of the record's `variants` entry the test exercises. Leave it `null` (or omit it) for the default call. A variant test lives beside the default one as `<resource>.<verb>.variant-<n>.action.ts`. Its `seed` applies the variant's `when.settings`, its `act` passes the variant's `when.args`, and its `expect` describes the variant merged over the top level. If the sandbox doesn't have the variant's `when.plan`, the test isn't written. The evidence records the index in `tested_on.variant`.

A record reaches `tested` only with a passing run whose observed class equals its top-level `class` (V3), which is normally the default-call test. A variant run adds evidence for that variant.

## Package layout

```
packages/harness/
  src/
    define.ts            # defineActionTest and types
    runner.ts            # lifecycle above
    classify.ts          # observed class from diffs, residue and the capability declaration
    trace.ts             # field allowlist, redaction, canonical JSON, hashing
    evidence.ts          # evidence YAML from a trace
    probes/              # webhook, mailbox, observer, ledger
    providers/<provider>/
      client.ts          # thin sandbox client with safety wrappers
      mock.ts            # in-memory mock with the same interface
      capabilities.ts    # which residue channels each probe can see in this sandbox
      snapshot.ts        # optional helpers
  test/                  # Vitest: runner, classify, trace
    actions.test.ts      # globs tests/actions/**/*.action.ts and runs each in mock mode
    fixtures/            # fictional acme data root and tests root for runner tests
tests/actions/<provider>/*.action.ts
runs/YYYY/MM/*.json      # redacted traces of passing sandbox runs, committed to the repo
runs/raw/                # gitignored: fail, inconclusive and D22-held traces
.harness-tmp/            # gitignored: mock-run traces
```

The root `package.json` lists `@palindev/harness` as a `workspace:*` devDependency, so action tests can import it.

## Probes

| Probe | Captures | Implementation |
| --- | --- | --- |
| `webhook` | Events the vendor sends to a registered endpoint | The vendor's own delivery log where it has one (for GitHub, the webhook deliveries API); otherwise a Cloudflare Worker receiver storing events in KV by run id. Stripe can use `stripe listen` instead |
| `mailbox` | Emails sent to test recipients | Catch-all addresses on a test subdomain (for example `probe.palin.dev`) routed by Cloudflare Email Routing to an Email Worker and stored in KV; `address(tag)` returns a run-specific address. See [Mailbox storage](#mailbox-storage) |
| `observer` | What another workspace member receives | A dedicated test account reading its own view through the vendor's API (for GitHub, the one dedicated observer machine account's notifications API; D25), or a test app subscribed to the vendor's event stream. Push notifications themselves can't be read, so this is often a proxy |
| `ledger` | Money movement and fees | Provider-specific reads, such as balance transactions in a payment sandbox |

Vendor-native observation APIs can be used as probes instead of probe Workers. They are read-only calls against sandbox accounts, made through the same client and Safety guards, and the observer account is checked against the tenant allowlist like the acting identity (for GitHub, the App installation). The observer client sends GET requests only, whatever scope its token has.

Every webhook the harness registers has a webhook secret and never points at a third-party request bin. When the vendor's delivery log is the probe, it points at a maintainer-controlled endpoint that stores nothing, or at a URL that refuses connections; otherwise it points at the webhook Worker. Only delivery summaries (event, action, status, time) reach the trace, never a delivery's request or response bodies.

A probe that can't observe something the docs describe leaves that residue item `observed_by: doc`; the harness never claims to have seen what it couldn't.

### Capability declarations

Each provider declares what its probes can see in its sandbox, in `packages/harness/src/providers/<provider>/capabilities.ts`:

```ts
export default defineCapabilities({
  sandbox: { plan: "free", settings: {} },   // copied into tested_on
  channels: [
    { kind: "email", audience: "external", probe: "mailbox", observed_by: "probe" },
    { kind: "webhook", audience: "actor", probe: "webhook", observed_by: "probe" },
    // A notification email stands in for the in-app notification.
    { kind: "notification", audience: "workspace", probe: "mailbox", observed_by: "proxy" },
  ],
});
```

- A channel is a residue `kind` plus `audience`. No probe can see a channel that isn't listed.
- The classifier treats a missing event as evidence of no residue only on channels marked `probe` (D18). On `proxy` and unlisted channels, silence proves nothing. Residue there is recorded only when a proxy sees it (`observed_by: proxy`) or when the test declares it from docs in `expect.documented_residue` (`observed_by: doc`), and the trace lists those channels under `unobserved_channels`. An observed R2 therefore means no probe saw residue on the channels it can see, and the docs name none elsewhere.
- List a channel only when a probe has been shown to see it in that sandbox. When unsure, leave it out: unlisted is the stricter reading.
- `sandbox.plan` and `sandbox.settings` describe the account. The runner copies them, plus a variant's `when.settings`, into the trace's `tested_on`.

### Mailbox storage

Mailbox probe storage is secret-bearing: vendor emails carry verification links, magic codes and invite tokens for the sandbox accounts. The Email Worker redacts links, codes and token-like strings before it stores a message, keeps only what a residue summary needs (sender, recipient tag, subject after redaction, time), never stores bodies or attachments, and never forwards mail (no Email Routing forward rules to any real inbox). It expires entries within 24 hours and requires authentication for every read. It never logs message content, headers or unredacted subjects, and Workers Logs and Logpush are off for it. It drops a message not addressed to an active run tag without storing anything. Account-recovery and root email addresses for sandbox accounts (the AWS member account's root, the GitHub machine account, test org owners) are never on the probe domain. The Worker gets a `security-reviewer` pass before its first use and after any change.

## Time windows

Windows of one hour or less are tested at both edges. Longer windows (such as 30-day trash retention) are tested for undo inside the window only; the test declares the doc-cited window in `expect.window`, so an R4 record can still reach `tested`, and the record's `notes` say the window length itself is doc-cited. The same applies to residue no probe can observe, through `expect.documented_residue`.

### Condition edges

A test lists `condition_edges` when the undo may stop working once something else happens (decision step 4 in [SCHEMA.md](SCHEMA.md#how-to-pick-a-class)). For each edge, the runner:

1. seeds a fresh fixture;
2. runs the act;
3. applies the edge's `apply` step;
4. runs the undo.

What the run records depends on the result:

- **The plain undo succeeds and the undo after an edge fails.** The run classifies R4 and records `window_condition` with `source: run`, naming the edge, so `expect.window` isn't needed for it.
- **Both succeed.** The edge is not a condition, and the trace says so.

The trace lists each edge with the undo's outcome. Each edge adds a fixture set, so declare edges only for conditions the docs leave open.

A run-discovered condition that vendor docs don't state is a finding under [D22](#when-a-run-contradicts-the-docs): its trace stays in `runs/raw/` until the maintainer releases it (D27).

## Trace format

```json
{
  "run_id": "2026-09-28T14-02-11Z_acme.invoices.send_ab12cd",
  "id": "acme.invoices.send",
  "mode": "sandbox",
  "date": "2026-09-28",
  "environment": "test_mode",
  "tested_on": { "plan": "free", "settings": {}, "variant": null },
  "harness_version": "0.1.0",
  "api_version": "2026-09-01",
  "steps": [{ "name": "act", "request": { "method": "POST", "path": "/v1/invoices/{id}/send" }, "status": 200, "duration_ms": 312 }],
  "hashes": { "before": "…", "after_act": "…", "after_undo": "…" },
  "diff_after_act": [{ "field": "status", "before": "draft", "after": "open" }],
  "diff_after_undo": [],
  "residue_events": [
    { "probe": "webhook", "kind": "webhook", "audience": "actor", "observed_by": "probe", "at": "2026-09-28T14:02:12Z", "summary": "invoice.sent event delivered" },
    { "probe": "mailbox", "kind": "email", "audience": "external", "observed_by": "probe", "at": "2026-09-28T14:02:13Z", "summary": "Invoice email to customer" }
  ],
  "documented_residue": [],
  "condition_edges": [{ "name": "invoice paid", "undo_after_edge": "failed", "source": "run" }],
  "unobserved_channels": ["audit_log:vendor"],
  "expected_class": "R3",
  "observed_class": "R3",
  "result": "pass"
}
```

`mode` is `mock` or `sandbox`. A trace holds only each step's request method, path template, status and duration; state hashes; diffs of snapshot fields; residue summaries; condition-edge outcomes; and the run's `tested_on`. It never holds raw vendor response payloads, full snapshots, webhook bodies or email bodies. D13 bars publishing raw vendor payloads, and some providers' terms need care here (Stripe among them). Committed traces are published with tested records as their receipts, so nothing goes into one that couldn't be public.

Redaction removes authorization headers, cookies, tokens, keys and any secret-looking string, including in diff values, before hashing. The hash covers the redacted, canonical JSON, so anyone can recompute it from the committed trace.

`pnpm harness evidence <run_id>` prints the matching `sandbox_run` evidence item, including `tested_on`. It refuses a trace whose `mode` isn't `sandbox`, and a trace in `runs/raw/`. `--write` refuses a record whose confidence is `draft`; promote it to `documented` first. `--write` adds the item to the record, sets `last_verified`, and sets `observed_by` to `probe` or `proxy` on the residue items the run saw (the variant's own `residue` for a variant run, when it sets one). Other items keep their value. It never removes a residue item; residue the run saw that the record doesn't list is reported for the maintainer, not added.

## Safety

| Guard | Rule |
| --- | --- |
| Opt-in network | Sandbox mode needs the `--sandbox` flag; the default is mock |
| Kill switch | `PALIN_HARNESS_DISABLED=1` stops every sandbox run at preflight; mock runs ignore it. Preflight reads it from the shell environment before loading `.env.sandbox` and again after, so either place works |
| Terms gate | Preflight refuses to start unless `<provider>/_provider.yaml` in the data root has `terms.status: green` or a filled `terms.consent` (D13, V24). Only the maintainer sets either |
| Key prefixes | Where a vendor has test-key prefixes, clients reject anything else (for example, Stripe keys must start `sk_test_` or `rk_test_`). Vendors without them (GitHub, AWS, Slack, Notion, Linear) rely on the tenant allowlist |
| Env loading | Mock mode never loads `.env.sandbox`; sandbox mode loads it only after the `--sandbox` flag and kill-switch checks pass |
| Live-mode check | Any response that reports live mode aborts the run |
| Tenant allowlist | At preflight, credentials for every account the run uses, observer accounts included, must resolve to the allowlisted sandbox account, org or workspace from `.env.sandbox`. Since `.env.sandbox` can't vouch for itself, GitHub adds every check in [GitHub sandbox](#github-sandbox-d25) |
| AWS account | A dedicated member account, never the management account; preflight checks the account and Organization ids and fails closed. Every rule in [AWS sandbox](#aws-sandbox-d14) applies |
| Created-set rule | Update and delete calls may only target objects created in the same run |
| Name prefix | Everything created is named `palin-test-…` |
| Rate limit | One request per second per provider by default |
| Billable actions | Refused unless `PALIN_ALLOW_BILLABLE=1` and the provider has a spend cap. AWS has no hard spend cap; a budget alarm fires hours after the spend and doesn't count as one. So, besides `PALIN_ALLOW_BILLABLE=1`, a billable AWS call needs all of: the test's declared worst-case cost (`max_cost` in the test file), which the maintainer approves in `/verify-action`; resources limited by the service control policy to one region and the smallest types; and cleanup in the same run. A budget action that applies a deny-all policy at the threshold is a backstop only |
| API only | The harness calls vendor APIs; it never scripts a browser session as an account owner |
| Trace content | Only method, path, status, state hashes, snapshot-field diffs and residue summaries; never raw vendor responses, webhook bodies or email bodies |
| Probe storage | Probe Workers authenticate reads and expire stored events. The mailbox Worker redacts before storing, logs no message content and passes a `security-reviewer` check before first use ([Mailbox storage](#mailbox-storage)). Registered webhooks follow the rules under [Probes](#probes) |
| Secrets | Read only from `process.env`, loaded from `.env.sandbox`, the GitHub App private key included (base64 PEM in `GITHUB_APP_PRIVATE_KEY_B64`); the harness never reads key files. Never logged, never in traces |
| CI | No workflow holds sandbox secrets while scheduled re-verification is deferred. When it is built, its secrets exist only in that scheduled workflow on `main`, never in pull request workflows |

The test is not written, and the record stays at `documented`, when:

- the action can only be tested with real money or a production account;
- the undo works only through the vendor's UI or admin console;
- the provider's terms aren't `green` and no consent is on file (D13).

### GitHub sandbox (D25)

The test org is the only GitHub tenant. The harness acts as a GitHub App installed on it and observes through one dedicated machine account. Neither is the maintainer's personal account, and no code path accepts a personal token for acting.

- **Denylist:** the client hard-codes a denylist of logins: the maintainer's personal account (`TheophilusJohn`) and the real `palindev` org. Preflight refuses if the sandbox org, the App installation's account or the observer login is on it.
- **App:** registered under the test org as private ("Only on this account"), with its key from `GITHUB_APP_PRIVATE_KEY_B64`. Preflight uses the App JWT to check that `GET /app/installations` returns exactly one installation, on the test org.
- **Observer:** a classic personal access token for the machine account with only the `notifications` and read-only `read:org` scopes. GitHub's notifications endpoints accept classic tokens only, `GET /user/orgs` needs `read:org`, and the test org's test repos are public, so no `repo` or `user` scope is needed. Because a classic token can't be limited to one org, preflight checks that `GET /user` returns `GITHUB_OBSERVER_LOGIN` and that `GET /user/orgs` lists only the test org; any error from either call refuses the run. The observer client sends GET requests only.
- **Routes:** the client allows only paths under `/repos/<test-org>/` or `/orgs/<test-org>/`, plus these owner-less calls, each with one credential:
  - observer token only: `GET /user`, `GET /user/orgs`, `GET /notifications`, `GET /notifications/threads/{id}`;
  - App JWT only: `GET /app`, `GET /app/installations`, `POST /app/installations/{id}/access_tokens` (the id must equal `GITHUB_APP_INSTALLATION_ID`) and `GET /app/hook/deliveries[/{id}]`.

  It refuses everything else, including `/graphql` and id-based routes such as `/repositories/{id}`.

### AWS sandbox (D14)

- **Account:** a dedicated member account in an AWS Organization, never the management account, where service control policies don't apply. Its service control policy allows only the services under test in one region, allows `sts:GetCallerIdentity` and `organizations:DescribeOrganization` in every region, and denies `organizations:LeaveOrganization` and IAM user or access-key creation. It also has a budget alarm, `palin-test-` names and a teardown script.
- **Preflight:** STS `GetCallerIdentity` must return `AWS_SANDBOX_ACCOUNT_ID`. `organizations:DescribeOrganization` must return `AWS_SANDBOX_ORG_ID`, and preflight refuses if the caller's account id equals `Organization.MasterAccountId`. It fails closed: any error from DescribeOrganization (AccessDenied, AWSOrganizationsNotInUseException, network) refuses the run.
- **Client:** every AWS client, including the one for `GetCallerIdentity`, gets explicit `credentials` and `region` built from `AWS_SANDBOX_*`, and `ignoreConfiguredEndpointUrls: true`. At startup the harness sets `AWS_EC2_METADATA_DISABLED=true`, points `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` at a nonexistent path, and deletes `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` and `AWS_ENDPOINT_URL*` from `process.env`. Shared config, profiles and instance metadata are never read.
- **Teardown:** a Node entry point that reuses this client and the full preflight (account id, Organization id, management-account refusal, fail closed), never the AWS CLI. It deletes only `palin-test-` resources.

## When a run contradicts the docs

A result that contradicts vendor docs follows D13 before any finding is published: the vendor gets a 14-day right of reply first, and security issues go through the vendor's disclosure program instead. Agents draft the right-of-reply email in `private/right-of-reply/<YYYY-MM-DD>-<id>.md` and a security report in `private/disclosures/<YYYY-MM-DD>-<id>.md`, never in `content/` or any other tracked path; the maintainer sends it (D9).

The record change and trace count as publishing too (D22). This covers a `pass` whose trace shows residue the record doesn't list, as well as a `fail`. For a doc contradiction, commit the record change on a separate local-only branch `embargo/<YYYY-MM-DD>-<id>`, never on the batch branch that gets pushed for its PR; the guard refuses any push while an `embargo/` branch is checked out and any push that names an `embargo/` ref. The trace itself stays in `runs/raw/` until the maintainer says to release it; it then moves to `runs/YYYY/MM/` on that same embargo branch, and only then can `pnpm harness evidence` cite it. The change moves to a pushed branch only after the vendor replies or 14 days pass after the email is sent. Meanwhile the pushed record keeps its doc-backed values at `documented`, with an `Open question:`. For a security-relevant result, don't `git add` the trace or the record change at all: keep the trace in `runs/raw/` (gitignored) and put the proposed change in the `private/disclosures/` file until the maintainer says the disclosure has closed.
