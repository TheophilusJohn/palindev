# Record schema (v0)

This is the canonical definition of a Palin record. `packages/schema` implements it as JSON Schema plus the extra rules in [Validation rules](#validation-rules). If code and this document disagree, fix one of them in the same PR.

Examples use a fictional provider, **Acme Billing** (`acme`), so no real vendor facts are implied. Fictional fixtures live only in `packages/*/test/fixtures/`, never in `data/`.

## Files and ids

```
data/
  <provider>/
    _provider.yaml             # one per provider
    <resource>.<verb>.yaml     # one per action
```

- A record's `id` is `<provider>.<resource>.<verb>`, lowercase, dot-separated, using `[a-z0-9_]` in each part. Example: `acme.invoices.send`.
- The file for `acme.invoices.send` is `data/acme/invoices.send.yaml`. The directory must equal `provider` and the file stem must equal the rest of the id.
- Resources may be nested with extra dots: `github.repos.branches.delete` lives at `data/github/repos.branches.delete.yaml`.
- Templates live in `docs/templates/`, never in `data/`.

## Reversibility classes

| Class | Name | Meaning | Minimum policy |
| --- | --- | --- | --- |
| R0 | Read-only | No state change anyone can observe | `allow` |
| R1 | Read with side effects | Only minor metadata on the object changes, visible only to the actor or admins (read markers, view counts) | `allow_and_log` |
| R2 | Clean undo | A vendor-supported way returns to the prior state, and nothing escapes to anyone else | `allow_and_log` |
| R3 | Undo with residue | A vendor-supported undo exists, but something escapes or is lost first | `confirm` |
| R4 | Time-boxed undo | Undo works only inside a time window or while a condition holds | `confirm` |
| R5 | Irreversible | No vendor-supported way back to the prior state | `confirm_strong` |

Logs of the call itself (API request logs, audit entries for the call) are not a state change for classification. They can still be recorded as residue with audience `vendor` or `actor`.

### How to pick a class

Walk these questions in order and stop at the first that decides:

1. **Does the call change state anyone could observe?** Logs of the call itself don't count. **No → R0.**
2. **Is the only change minor metadata on the object, visible only to the actor or admins** (read markers, view counts)? **Yes → R1.** If anyone else is told, such as a read receipt, keep going.
3. **Is there a vendor-supported way back to the prior state**, through an API call or a documented UI or admin path? Recreating an equivalent object counts, even if it gets a new id; record the new id as `lost_state` residue. A compensating action that leaves the original change in place (a new charge to offset a refund, a correction message after a sent one) does not count. **No → R5.**
4. **Does that way stop working after a time limit or condition** (trash retention, a recall window, "until the invoice is paid")? **Yes → R4.**
5. **Does anything escape or get lost that the undo can't take back?** That means any residue with audience `workspace` or `external`, or of kind `fee_retained` or `lost_state`, including residue that only happens under a condition. **Yes → R3. No → R2.**

Always record residue, whatever the class. When two classes seem plausible, choose the stricter one and explain why in `notes`.

## Policy scale

`allow` < `allow_and_log` < `confirm` < `confirm_strong` < `block`

`recommended_policy` must be at least the class minimum above, raised by these flags:

| Flag | Raises the minimum to |
| --- | --- |
| `moves_money: true` | `confirm` |
| `changes_permissions: true` | `confirm` |
| `reaches_third_parties: true` | `confirm` |
| `bulk: true` | one step above whatever the minimum otherwise is, capped at `confirm_strong` |

`block` is never a computed minimum. Only a maintainer sets it, for actions no agent should run unattended (for example, deleting an organization).

## Record fields

Keys appear in this order in every file. **Drafts** (`confidence: draft`) may leave out any field not marked "always"; each field they leave out must be named by a `todo` evidence item (rule V19).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | always | See [Files and ids](#files-and-ids) |
| `provider` | string | always | Must match a `data/<provider>/_provider.yaml` |
| `title` | string | always | Short, imperative: "Send an invoice" |
| `summary` | string | yes | One plain sentence on what the call does |
| `operation` | object | always | See below |
| `api_version` | string | yes | Version tested or documented, or `unversioned` |
| `mcp_tool_aliases` | list | no | `{server, tool}` pairs used by known MCP servers |
| `class` | enum | always | `R0` to `R5` |
| `flags` | object | yes | See below |
| `undo` | object | yes | See below |
| `residue` | list | yes | Empty list allowed except where rules require entries |
| `suggested_annotations` | object | yes | See [MCP annotation mapping](#mcp-annotation-mapping) |
| `recommended_policy` | enum | yes | See [Policy scale](#policy-scale) |
| `confidence` | enum | always | `tested`, `documented`, `community`, `draft` |
| `evidence` | list | always | At least one item |
| `last_verified` | date | yes, never on drafts | `YYYY-MM-DD` |
| `related` | list | no | Ids of related records, such as the inverse action |
| `notes` | string | no | Markdown; open questions go here, prefixed `Open question:` |

### `operation`

```yaml
operation:
  kind: http            # http | graphql | rpc
  method: POST          # http only: GET, POST, PUT, PATCH, DELETE
  path: /v1/invoices/{invoice}/send   # http: path template; rpc: method name; graphql: mutation name
```

### `mcp_tool_aliases`

```yaml
mcp_tool_aliases:
  - server: acme/acme-mcp       # repo or registry name of the MCP server
    tool: send_invoice
```

### `flags`

All booleans default to `false`; write every key explicitly.

```yaml
flags:
  moves_money: false
  reaches_third_parties: true    # anyone outside the workspace is contacted or can see the result
  changes_permissions: false     # access, roles, sharing, tokens, keys
  bulk: false                    # one call can affect many objects
  needs_admin_scope: false
  idempotent: natural            # natural | key | no  (key = only with an idempotency key)
```

### `undo`

```yaml
undo:
  method: inverse_call     # inverse_call | restore | compensating_action | none | not_applicable
  operation:               # the API call, when there is one
    kind: http
    method: POST
    path: /v1/invoices/{invoice}/void
  steps: []                # plain-language steps; required when the undo is UI or admin only
  window: null             # ISO 8601 duration such as P30D
  window_condition: null   # a condition instead of a duration, such as "until the invoice is paid"
  compensating_action: null   # required when method is compensating_action
```

- `restore` means bringing a deleted object back (trash, recycle bin, soft delete) or recreating an equivalent one.
- `not_applicable` is only valid for R0.

### `residue`

```yaml
residue:
  - kind: email            # notification | email | webhook | fee_retained | audit_log | third_party_copy | lost_state | cache | other
    audience: external     # actor | workspace | external | vendor
    when: "if the customer has an email address"   # optional condition
    note: "The customer receives the invoice email immediately; voiding sends a second email."
```

`audience` decides whether residue affects the class (decision step 5): `workspace` and `external` do; `actor` and `vendor` don't, unless the kind is `fee_retained` or `lost_state`.

### `evidence`

Every item has a `type`. Items can list the fields they support with `supports`.

```yaml
evidence:
  - type: doc
    url: https://docs.acme.example/api/invoices/send
    quote: "Sending an invoice emails it to the customer."   # 40 words max
    retrieved: 2026-10-05
    supports: [summary, residue]
  - type: sandbox_run
    run_id: 2026-10-05T14-02-11Z_acme.invoices.send_ab12cd
    date: 2026-10-05
    environment: test_mode         # test_mode | dev_workspace | test_account; never mock
    result: pass                   # pass | fail | inconclusive
    observed_class: R3
    trace_sha256: 3f5a...          # 64 hex characters
    trace_path: runs/2026/10/2026-10-05T14-02-11Z_acme.invoices.send_ab12cd.json
  - type: community
    url: https://github.com/example/issue/12
    date: 2026-10-06
    summary: "Report that voided invoices still trigger a second email."
  - type: vendor_statement
    url: https://docs.acme.example/changelog#2026-09
    date: 2026-09-12
  - type: todo                     # only allowed while confidence is draft
    field: undo.window             # the field this evidence is missing for
    note: "Find the docs page that states the void window."
```

### `_provider.yaml`

```yaml
id: acme
name: Acme Billing
docs_url: https://docs.acme.example
api_reference_url: https://docs.acme.example/api
openapi_url: null                  # if published
changelog_url: https://docs.acme.example/changelog
versioning: "Date-based version header"
current_api_version: "2026-09-01"
terms_url: https://acme.example/legal/api
sandbox:
  kind: test_mode                  # test_mode | dev_workspace | test_account | none
  signup_url: https://acme.example/signup
  cost: free                       # free | paid | unknown
  notes: "Test-mode keys start with sk_test_."
evidence:                          # doc items backing versioning, sandbox and terms
  - type: doc
    url: https://docs.acme.example/testing
    quote: "Use test mode keys to build your integration without moving real money."
    retrieved: 2026-10-05
    supports: [sandbox]
last_reviewed: 2026-10-05
```

## MCP annotation mapping

`suggested_annotations` must match the class and flags:

| Class | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
| --- | --- | --- | --- | --- |
| R0 | true | false | true | true |
| R1 | false | false | `idempotent == natural` | true |
| R2 | false | true if it changes or removes existing data; false if it only adds | `idempotent == natural` | true |
| R3, R4, R5 | false | true | `idempotent == natural` | true |

`openWorldHint` is always true because every record describes an external SaaS call. MCP defines `destructiveHint: false` as "only additive updates", which is why R2 depends on the action.

For `palin lint`, only unsafe mismatches are contradictions: `readOnlyHint: true` on R1 to R5, or `destructiveHint: false` on R3 to R5. Stricter-than-needed annotations are reported as `overcautious`.

## Confidence

| Level | Means | How a record gets there |
| --- | --- | --- |
| `tested` | A sandbox run observed the recorded class | A passing `sandbox_run` with `observed_class` equal to `class` |
| `documented` | Vendor docs support every factual field | A maintainer reviewed the citations |
| `community` | Reported by someone else, reviewed | A reviewed pull request with a `community` source |
| `draft` | Drafted, not yet reviewed | Default for anything an agent writes |

Only a human review promotes `draft` to `documented`. Agents never do it on their own. Before promotion, every `todo` item is resolved or turned into an `Open question:` line in `notes`, and every field required for non-drafts is present.

**Staleness** is applied at build time, not in the files. If the newest passing run is more than 30 days older than the build date, the compiled record's `effective_confidence` drops to `documented` (when doc evidence exists) or `community`. Draft records are left out of published bundles unless `--include-drafts` is passed.

## Validation rules

`pnpm validate` enforces JSON Schema plus these rules. Each rule gets its own test. For drafts, rules V7 to V14 check only the fields that are present.

| Rule | Check |
| --- | --- |
| V1 | `id` equals `<directory>.<file stem>` and `provider` equals the directory |
| V2 | `data/<provider>/_provider.yaml` exists and is valid |
| V3 | `tested` requires at least one `sandbox_run` with `result: pass` and `observed_class == class` |
| V4 | `documented` requires at least one `doc` or `vendor_statement` item |
| V5 | `todo` evidence is only allowed when `confidence: draft` |
| V6 | `last_verified` is required unless `confidence: draft`, forbidden on drafts, and not in the future |
| V7 | R0 requires `undo.method: not_applicable`, empty residue, and `moves_money`, `reaches_third_parties`, `changes_permissions` and `bulk` all false |
| V8 | R2 residue may only have audience `actor` or `vendor`, and never kind `fee_retained` or `lost_state` |
| V9 | R3 requires at least one residue item with audience `workspace` or `external`, or kind `fee_retained` or `lost_state` |
| V10 | R4 requires `undo.window` or `undo.window_condition`; every other class requires both to be null |
| V11 | R0 requires `not_applicable`; R1 allows any method except `not_applicable`; R2 to R4 require `inverse_call` or `restore`; R5 requires `none` or `compensating_action` |
| V12 | `inverse_call` and `restore` require `undo.operation` or non-empty `undo.steps`; `compensating_action` requires `undo.compensating_action` |
| V13 | `suggested_annotations` match the [mapping](#mcp-annotation-mapping); for R2, either `destructiveHint` value passes |
| V14 | `recommended_policy` is at least the minimum from class and flags |
| V15 | Every URL uses `https://`; every date is `YYYY-MM-DD`; `window` is a valid ISO 8601 duration |
| V16 | No file contains a secret (API keys, tokens, private keys). Email addresses are only allowed on `example.com`, `example.org`, `*.example`, or the probe domain set in `PALIN_PROBE_MAIL_DOMAIN` |
| V17 | `related` ids exist |
| V18 | Keys appear in the documented order (warning only; `pnpm validate --fix` reorders) |
| V19 | In a draft, every field required for non-drafts that is missing is named by a `todo` item's `field` |
