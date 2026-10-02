# Record schema (v0)

This is the canonical definition of a Palin record. `packages/schema` implements it as JSON Schema plus the extra rules in [Validation rules](#validation-rules). If code and this document disagree, fix one of them in the same PR.

Examples use a fictional provider, **Acme Billing** (`acme`), so no real vendor facts are implied. Fictional fixtures live only in `packages/*/test/fixtures/`, never in `data/`. They are exempt from CLAUDE.md rule 2 and D23: they may set any `confidence`, `terms.status` or `terms.consent`, and their `sandbox_run` items are fictional.

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
- Besides provider directories, a data root holds only `LICENSE` and `README.md`. V1 reports any other file there, subdirectories of a provider directory, `.yml` extensions and symlinks, which are never followed.
- Files are YAML 1.2, read with the core schema (the `yaml` package's defaults). Quote values that other parsers may type differently: `idempotent: "no"`, `trace_sha256`, `api_version`, `current_api_version`, and yes, no, on or off values in `settings`. `pnpm validate --fix` and `pnpm harness evidence --write` write them quoted. Tags that read as something other than a plain mapping, list or scalar (`!!omap`, `!!pairs`, `!!set`, `!!binary`, `!!timestamp`) are `yaml` errors, since they would hide their contents from the checks.

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

Keys appear in this order in every file. **Drafts** (`confidence: draft`) may leave out any field not marked "always"; each field required for non-drafts that they leave out, except `last_verified`, must be named by a `todo` evidence item (rule V19).

On non-drafts, every key in the `flags` and `undo` blocks below and all four `suggested_annotations` hints are required. Write `null` or `[]` explicitly, where `null` means known to be none. A draft may leave out individual sub-keys; each needs a `todo` whose `field` is the dotted path, such as `undo.window`. In these three objects an absent key means unknown, which only a draft may say.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | always | See [Files and ids](#files-and-ids) |
| `provider` | string | always | Must match a `data/<provider>/_provider.yaml` |
| `title` | string | always | Short, imperative: "Send an invoice" |
| `summary` | string | yes | One plain sentence on what the call does |
| `operation` | object | always | See below |
| `api_version` | string | yes | Version tested or documented, or `unversioned` |
| `mcp_tool_aliases` | list | no | `{server, tool}` pairs used by known MCP servers, with optional argument matchers |
| `cli_aliases` | list | no | CLI commands that perform this operation, such as `gh repo delete` |
| `class` | enum | always | `R0` to `R5`. With `variants`, the strictest class across the record and its variants |
| `flags` | object | yes | See below |
| `undo` | object | yes | See below |
| `residue` | list | yes | Empty list allowed except where rules require entries |
| `suggested_annotations` | object | yes | See [MCP annotation mapping](#mcp-annotation-mapping) |
| `recommended_policy` | enum | yes | See [Policy scale](#policy-scale) |
| `approval_text` | string | yes for R3 to R5 | What a person should know before approving, in 120 characters or fewer |
| `variants` | list | no | Different behaviour under specific arguments, settings or plans |
| `confidence` | enum | always | `tested`, `documented`, `community`, `draft` |
| `evidence` | list | always | At least one item |
| `last_verified` | date | yes, never on drafts | `YYYY-MM-DD` |
| `related` | list | no | Ids of related records, such as the inverse action |
| `notes` | string | no | Markdown; open questions go here, prefixed `Open question:` |

### `operation`

```yaml
operation:
  kind: http            # http | graphql | rpc
  # service: s3        # optional lowercase service name such as s3 or dynamodb; required when provider is aws
  method: POST          # required for http (GET, POST, PUT, PATCH, DELETE); forbidden for graphql and rpc
  path: /v1/invoices/{invoice}/send   # http: path template; rpc: method name; graphql: root field name
```

- `service` is optional, except that every `aws` operation sets it, because method names and S3 paths repeat across AWS services.
- For `graphql`, `path` is the operation's root field name, whether it is a query or a mutation.
- `undo.operation` and a capture item's `before` have the same shape.

### `mcp_tool_aliases`

```yaml
mcp_tool_aliases:
  - server: acme/acme-mcp       # repo or registry name of the MCP server
    tool: send_invoice
  - server: acme/acme-mcp
    tool: invoice_write         # one tool that dispatches on an argument
    match:                      # optional: the alias applies only when these arguments have these values
      method: send
  - server: acme/acme-mcp
    tool: acme_api_write        # a generic tool that takes any HTTP method and path
    operation_from_args:        # optional: read the operation from these arguments, then match on `operation`
      method: method
      path: path
```

- `match` maps argument names to one value or a list of values. Values are strings, numbers or booleans; a list means any of them. All listed arguments must match.
- `operation_from_args` names the arguments that hold the HTTP method and path, and needs both keys. The matcher then compares them to `operation` with path parameters normalized. Use it for generic tools such as a `*_api_write`.
- An alias has at most one of `match` and `operation_from_args`.
- An alias without `match` or `operation_from_args` applies to every call of that tool, so use it only when the tool does one thing.

### `cli_aliases`

```yaml
cli_aliases:
  - command: acme invoices send      # tokens the command line must start with
  - command: acme api                # a generic CLI call
    match:                           # optional: flags or positional values that must be present
      method: POST
      path: /v1/invoices/{invoice}/send
```

`command` is compared token by token after shell parsing, ignoring global flags such as `--profile` or `--repo`. `match` works as it does for MCP aliases, with the same value types: it maps flag names without dashes, or `path` for a positional path, to required values.

### `flags`

Every key is required on non-drafts (see [Record fields](#record-fields)). `modifies_existing` is always `false` on R0 and R1 records; it decides `destructiveHint` for R2 and separates the two lint findings below.

```yaml
flags:
  moves_money: false
  reaches_third_parties: true    # anyone outside the workspace is contacted or can see the result
  changes_permissions: false     # access, roles, sharing, tokens, keys
  bulk: false                    # one call can affect many objects
  modifies_existing: true        # changes or deletes existing objects or content (minor R1 metadata such as read markers doesn't count); false when it only creates new ones
  needs_admin_scope: false
  idempotent: natural            # natural | key | "no", quoted  (key = only with an idempotency key)
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
  compensating_action: null   # a string, one plain sentence; required when method is compensating_action
  capture: []              # values to save so the undo is possible later, such as [id]
```

- `restore` means bringing a deleted object back (trash, recycle bin, soft delete) or recreating an equivalent one.
- `not_applicable` is only valid for R0.
- `compensating_action` is a string. Put its API call, if any, in `undo.operation`. `undo.operation` is `null` when `method` is `none` or `not_applicable`.
- `capture` lists values the undo needs that can't be looked up afterwards. Each item is either a JSON path in the action's response (a string, for example `id` or `invoice.number`), or an object for a value that must be read before the call: `before` is the read call (shaped like `operation`) and `field` is the JSON path in its response. For example, if deleting an Acme tag returned no body and recreating it needed the old color:

  ```yaml
  capture:
    - before: { kind: http, method: GET, path: "/v1/tags/{tag}" }   # quote paths with braces inside flow maps
      field: tag.color
  ```

  Leave `capture` empty when the undo needs nothing beyond the original request.

### `residue`

```yaml
residue:
  - kind: email            # notification | email | webhook | fee_retained | audit_log | third_party_copy | lost_state | cache | other
    audience: external     # actor | workspace | external | vendor
    when: "if the customer has an email address"   # optional condition
    note: "The customer receives the invoice email immediately; voiding sends a second email."
    observed_by: doc       # probe | proxy | doc
```

`audience` decides whether residue affects the class (decision step 5): `workspace` and `external` do; `actor` and `vendor` don't, unless the kind is `fee_retained` or `lost_state`.

`observed_by` says where the item comes from:

- `probe`: a harness probe captured this exact channel in a sandbox run.
- `proxy`: a run captured a stand-in for the channel. For example, a notification email stands in for an in-app notification, or an invite email for a copy in an external calendar.
- `doc`: the item comes only from doc evidence.

`probe` and `proxy` need a passing `sandbox_run` on the record. When no probe can see a channel in a provider's sandbox (for example, customer emails in a payments sandbox that doesn't send them), a silent run is not evidence that nothing escaped. The item stays `doc`.

### `approval_text`

```yaml
approval_text: "Emails the customer now; voiding later sends a second email."
```

One plain sentence of 120 characters or fewer that a host or gateway can show in an approval prompt. Say what escapes and whether it can be undone, not what the tool is called. Required on non-draft R3 to R5 records.

### `variants`

Use `variants` when arguments, account settings or the plan change the class, the residue or the undo. Each variant has a `when` condition and the fields that differ from the top level; anything it leaves out is inherited.

```yaml
variants:
  - when:
      args: { send_email: false }       # argument values, as passed to the API
    class: R2
    flags: { reaches_third_parties: false }
    residue: []
    recommended_policy: allow_and_log
    approval_text: null
    notes: "No email is sent when send_email is false."
  - when:
      settings: { invoice_emails: disabled }   # account or workspace settings
      plan: [free]                             # optional: plan names from the provider's docs
    class: R2
    flags: { reaches_third_parties: false }
    residue: []
    recommended_policy: allow_and_log
    approval_text: null
```

- `when` can use `args`, `settings` and `plan`. All listed conditions must hold; a list of values means any of them.
- Surfaces evaluate `when.args` only against API parameters: those of a call matched by `operation`, or the request an `operation_from_args` tool passes through. For any other alias (a plain or `match` MCP alias, a CLI alias) the condition counts as unknown, and the top level applies.
- A variant can set `class`, `flags`, `undo`, `residue`, `suggested_annotations`, `recommended_policy`, `approval_text` and `notes`. Absent keys inherit; an explicit `null` clears. `flags` and `suggested_annotations` merge key by key over the top level. `residue` and `undo` replace the top-level value wholesale, so a variant's `undo`, when set, is a complete `undo` object.
- A variant that sets `class` to R3 to R5 sets its own non-null `approval_text`, because the top-level text describes the default call. A variant that sets R0 to R2 on an R3 to R5 record sets `approval_text: null`. A variant that doesn't set `class` on an R3 to R5 record doesn't set `approval_text: null`, which would leave that call with no approval text.
- The top-level fields describe the default call, meaning the behaviour when the arguments, settings and plan aren't known. So the top-level `class` and `recommended_policy` must be at least as strict as every variant's (rule V20). A surface that can't evaluate `when` uses the top level.
- Every variant, merged over the top level, must pass the same class rules as a record (V7 to V14). V21 applies to variant residue items too.
- A variant applies only when every condition in its `when` is known to hold. If more than one applies, use the strictest: class first, then `recommended_policy`.
- Each variant's `when` and every field it changes need their own evidence, named in `supports` (for example `"variants[0].when"`). A variant that drops a residue item must cite evidence that its condition removes it. Adding or changing a variant that is weaker than the top level falls under CLAUDE.md rule 7 (never weaken a record silently): it lowers the answer for those calls.
- Once a record has sandbox runs that exercised a variant, don't reorder or remove its variants, because `tested_on.variant` points at them by position. Append new variants at the end.

### `evidence`

Every item has a `type`. Items can list the fields they support with `supports`, including nested fields such as `undo.window`, `variants[0].when` or `variants[0].residue` (variants counted from 0). Quote paths that contain brackets inside a flow list, as in `supports: [summary, "variants[0].when"]`, or use a block list; unquoted brackets there are a YAML syntax error.

```yaml
evidence:
  - type: doc
    url: https://docs.acme.example/api/invoices/send
    quote: "Sending an invoice emails it to the customer."   # 40 words max (V15)
    retrieved: 2026-09-28
    supports: [summary, residue]
  - type: sandbox_run
    run_id: 2026-09-28T14-02-11Z_acme.invoices.send_ab12cd
    date: 2026-09-28
    environment: test_mode         # test_mode | dev_workspace | test_account; never mock
    result: pass                   # pass | fail | inconclusive
    observed_class: R3
    trace_sha256: "3f5a..."        # 64 lowercase hex characters, quoted
    trace_path: runs/2026/09/2026-09-28T14-02-11Z_acme.invoices.send_ab12cd.json
    tested_on:                     # what the run was observed under
      plan: "free"                 # plan or edition of the sandbox account
      settings: {}                 # non-default account settings that matter, if any
      variant: null                # index (counted from 0) of the variant exercised, or null for the default call
    vendor_paid: false             # true when the run was done under a vendor-paid engagement (D11)
  - type: community
    url: https://github.com/example/issue/12
    date: 2026-09-28
    summary: "Report that voided invoices still trigger a second email."
  - type: vendor_statement
    url: https://docs.acme.example/changelog#2026-09
    date: 2026-09-12
  - type: todo                     # only allowed while confidence is draft
    field: undo.window             # the field this evidence is missing for
    note: "Find the docs page that states the void window."
```

| Type | Required keys | Optional keys |
| --- | --- | --- |
| `doc` | `url`, `quote`, `retrieved` | `supports` |
| `sandbox_run` | `run_id`, `date`, `environment`, `result`, `observed_class`, `trace_sha256` (64 lowercase hex), `trace_path` (`runs/YYYY/MM/<run_id>.json`), `tested_on` with `plan` (string or `null`), `settings` (object) and `variant` (integer from 0, or `null`), `vendor_paid` (boolean) | `supports` |
| `community` | `url`, `date`, `summary` | `supports` |
| `vendor_statement` | `url`, `date` | `quote`, `supports` |
| `todo` | `field`, `note` | none |

`supports` entries and `todo.field` are field paths matching `^[A-Za-z_][A-Za-z0-9_]*(\[\d+\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\d+\])?)*$`, for example `undo.window` or `variants[0].residue`. Offline validate doesn't open trace files or recompute `trace_sha256` in v0.

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
terms:                             # may Palin test this provider and publish the results? (D13)
  status: green                    # green | yellow | red
  consent: null                    # or { date: YYYY-MM-DD, from: "role at vendor", reference: "where the written consent is kept" }
  notes: "Developer terms allow testing in your own test account and publishing results."
sandbox:
  kind: test_mode                  # test_mode | dev_workspace | test_account | none
  signup_url: https://acme.example/signup
  cost: free                       # free | paid | unknown
  notes: "Test-mode keys start with sk_test_."
evidence:                          # doc items backing versioning, sandbox and terms
  - type: doc
    url: https://docs.acme.example/testing
    quote: "Use test mode keys to build your integration without moving real money."
    retrieved: 2026-09-28
    supports: [sandbox]
  - type: doc
    url: https://acme.example/legal/api
    quote: "You may test the API in your own test account and publish the results."
    retrieved: 2026-09-28
    supports: [terms]
  - type: doc
    url: https://docs.acme.example/api/versioning
    quote: "Each request names a dated API version in the Acme-Version header."
    retrieved: 2026-09-28
    supports: [versioning, current_api_version]
last_reviewed: 2026-09-28
```

Every key shown is required. Provider files have no draft state: if a required value can't be backed by evidence, don't write a guess or a `todo`; stop and name the missing keys to the maintainer.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Equals the directory name (V1) |
| `name` | string | Display name |
| `docs_url`, `api_reference_url`, `changelog_url`, `terms_url` | URL | |
| `openapi_url` | URL or `null` | `null` when the vendor publishes no OpenAPI file |
| `versioning` | string | How versions work, in a few words |
| `current_api_version` | string | Quoted; `unversioned` if the API has no versions |
| `terms.status` | enum | `green`, `yellow`, `red`; see below |
| `terms.consent` | object or `null` | When set, `date`, `from` and `reference` are all non-empty. That is what "filled" means for V24 |
| `terms.notes` | string | What the terms say, and for `yellow` what is unclear |
| `sandbox.kind` | enum | `test_mode`, `dev_workspace`, `test_account`, `none` |
| `sandbox.signup_url` | URL or `null` | `null` only when `kind` is `none` |
| `sandbox.cost` | enum | `free`, `paid`, `unknown` |
| `sandbox.notes` | string | |
| `evidence` | list | `doc` and `vendor_statement` items only, never `todo` |
| `last_reviewed` | date | `YYYY-MM-DD` |

V1, V15, V16 and V18 apply to provider files as well as records.

`terms.status` records the maintainer's reading of the provider's API, developer-program and sandbox terms on benchmarking, publishing results and commercial use:

- `green`: allowed.
- `yellow`: unclear or conditional. Records stay `documented` until the rating is `green` or consent is on file; `notes` says what is unclear.
- `red`: likely prohibited without consent.

An agent may set `status` only to `red`: as a placeholder when drafting, with its proposed rating and quoted evidence in `notes`, or to lower a rating when terms tighten. Only the maintainer raises it to `yellow` or `green` or fills `consent` (D23). A provider's records can reach `tested` only when `status` is `green` or `consent` is filled in (rule V24).

## MCP annotation mapping

`suggested_annotations` must match the class and flags:

| Class | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
| --- | --- | --- | --- | --- |
| R0 | true | false | true | true |
| R1 | false | false | `idempotent == natural` | true |
| R2 | false | `flags.modifies_existing` | `idempotent == natural` | true |
| R3, R4, R5 | false | true | `idempotent == natural` | true |

`openWorldHint` is always true because every record describes an external SaaS call. MCP defines `destructiveHint: false` as "only additive updates", which is why R2 follows `flags.modifies_existing`.

Open question: clients read `openWorldHint` differently. Some platform guidance allows `false` for a bounded private workspace. At least one client auto-runs tools marked `destructiveHint: false` plus `openWorldHint: false`, so relaxing it could silence prompts for R2 and R3 actions. Revisit with a per-client analysis before lint ships.

When `palin lint` is built, it separates two kinds of finding:

- `spec_violation`: the annotation contradicts the MCP spec itself. That means `readOnlyHint: true` on R1 to R5, or `destructiveHint: false` on a record with `flags.modifies_existing: true`.
- `risk_not_expressible`: the annotation follows the spec but hides the risk, such as `destructiveHint: false` on an R3 to R5 record with `flags.modifies_existing: false` (sending an email, creating a charge). MCP has no hint for "additive but irreversible". This is advisory: it cites the record and suggests `destructiveHint: true` as the conservative convention.

Stricter-than-needed annotations are reported as `overcautious`. `destructiveHint: true` on an R2 record is not overcautious: being undoable alone doesn't justify `false`.

## Confidence

| Level | Means | How a record gets there |
| --- | --- | --- |
| `tested` | The state change and the undo were observed in a named sandbox on a date. Each residue item says whether a probe saw it or it comes from docs | A passing `sandbox_run` with `observed_class` equal to `class`, on a provider whose terms allow it (V24) |
| `documented` | Vendor docs support every factual field | A maintainer reviewed the citations |
| `community` | Reported by someone else, reviewed | A reviewed pull request with a `community` source |
| `draft` | Drafted, not yet reviewed | Default for anything an agent writes |

Only a human review promotes `draft` to `documented`. Agents never do it on their own. Before promotion, every `todo` item is resolved or turned into an `Open question:` line in `notes`, and every field required for non-drafts is present.

`tested` never claims that every residue channel was observed, or that the sandbox behaves exactly like production; `observed_by` on each residue item shows what was actually seen. Surfaces show it as "Observed in <sandbox> on <date>", with the count of residue items a probe or proxy saw.

**Staleness** is applied at build time, not in the files. If the newest passing run is more than 90 days older than the build date, the compiled record's `effective_confidence` becomes `tested_stale`. The record keeps its tested facts but shows its last observed date prominently, and consumers can apply a stricter freshness threshold. `tested_stale` exists only in compiled bundles, never in record files. Draft records are left out of published bundles unless `--include-drafts` is passed.

## Validation rules

`pnpm validate` enforces JSON Schema plus these rules. Each rule gets its own test. Every error names the file, the rule id and the field path, written in the `supports` syntax (`a.b[0].c`). JSON Schema failures (a missing required key, a bad enum or type) report rule id `schema`; YAML parse failures report rule id `yaml` with the line. A problem with a whole file has the path `(file)`. Two structural checks JSON Schema can't express also report `schema`: a `sandbox_run`'s `trace_path` is `runs/YYYY/MM/<run_id>.json` for its own run and the month of its `date`, and `tested_on.variant` points at a variant the record has. A file with YAML errors gets only `yaml` problems plus V1's layout check, V2 and V16; a file that fails JSON Schema gets `schema` problems plus V1, V2, V16 and V18; the other rules run only on files that pass, so one mistake doesn't cascade (D26). No path or message repeats a secret: anything V16's patterns match is redacted, and email addresses show only their domain. For drafts, rules V7 to V14 and V20 to V22 check only the fields that are present. The validator takes an injectable `now` (default: today in UTC) for date checks, and tests pass a fixed date. V23 needs the network, so it runs only with `pnpm validate --quotes`: by hand before promotion and during `/triage-drift`, never in the offline validate that hooks and CI run. A scheduled run waits for `drift-watch.yml` (see the ROADMAP "After launch" table).

| Rule | Check |
| --- | --- |
| V1 | `id` equals `<directory>.<file stem>` and `provider` equals the directory. For `_provider.yaml`, `id` equals the directory |
| V2 | `data/<provider>/_provider.yaml` exists and is valid |
| V3 | `tested` requires at least one `sandbox_run` with `result: pass`, `tested_on.variant: null` (the default call) and `observed_class == class` |
| V4 | `documented` requires at least one `doc` or `vendor_statement` item; `community` requires at least one `community` item |
| V5 | `todo` evidence is only allowed when `confidence: draft` |
| V6 | `last_verified` is required unless `confidence: draft`, forbidden on drafts, and not after the validator's `now` |
| V7 | R0 requires `undo.method: not_applicable`, empty residue, and `moves_money`, `reaches_third_parties`, `changes_permissions`, `bulk` and `modifies_existing` all false; R1 requires `modifies_existing: false` |
| V8 | R2 residue may only have audience `actor` or `vendor`, and never kind `fee_retained` or `lost_state` |
| V9 | R3 requires at least one residue item with audience `workspace` or `external`, or kind `fee_retained` or `lost_state` |
| V10 | R4 requires `undo.window` or `undo.window_condition`; every other class requires both to be null |
| V11 | R0 requires `not_applicable`; R1 allows any method except `not_applicable`; R2 to R4 require `inverse_call` or `restore`; R5 requires `none` or `compensating_action` |
| V12 | `inverse_call` and `restore` require `undo.operation` or non-empty `undo.steps`; `compensating_action` requires `undo.compensating_action`; `none` and `not_applicable` require `undo.operation: null` |
| V13 | `suggested_annotations` match the [mapping](#mcp-annotation-mapping); for R2, `destructiveHint` equals `flags.modifies_existing` |
| V14 | `recommended_policy` is at least the minimum from class and flags |
| V15 | Every URL uses `https://`; every date is `YYYY-MM-DD`; `window` is a valid ISO 8601 duration; each `doc` quote is at most 40 whitespace-separated words |
| V16 | No file under the data root contains a secret. It uses the same patterns as `SECRET_PATTERNS` in `.claude/hooks/guard.mjs`, with no FAKE exemption (its invalid fixture uses a FAKE-marked key such as `sk_test_FAKE…`). Email addresses are only allowed on `example.com`, `example.org`, `*.example`, or the probe domain in `process.env.PALIN_PROBE_MAIL_DOMAIN` when it is set; when it isn't, only the example domains pass. File names are checked too, and so are a YAML file's parsed keys and values (YAML escapes can spell a key the raw text doesn't show). UTF-16 files are decoded first. A binary file (other than `.DS_Store`) is reported, since it can't be read, and the raw bytes of binary and UTF-16 files are searched for keys as well |
| V17 | `related` ids exist. Within a provider, no two records share an `operation` (service, method, and path with parameters normalized, whatever the `kind`), and no server and tool pair appears on two records if either alias has neither `match` nor `operation_from_args` |
| V18 | Keys appear in the documented order: the top-level keys of records (the [Record fields](#record-fields) order) and of `_provider.yaml` (its example's order), and nested objects in the key order of their example blocks, with `supports` last in any evidence item. V18 also warns when a value [Files and ids](#files-and-ids) asks to quote is plain: `idempotent: "no"`, `api_version`, `current_api_version`, `trace_sha256`, and yes, no, on or off values in `settings`, in any case. Warning only; `pnpm validate --fix` reorders every level, quotes those values and keeps comments, and in the files it rewrites it also normalizes formatting (flow-collection padding, folded scalars, line endings) |
| V19 | In a draft, every field required for non-drafts that is missing, except `last_verified`, is named by a `todo` item's `field`; a missing sub-key of `flags`, `undo` or `suggested_annotations` is named by its dotted path. That includes residue `observed_by` and a variant's `approval_text` where V21 and V22 require them, such as `residue[0].observed_by` |
| V20 | Each variant, merged over the top level, passes V7 to V14. The top-level `class` is at least as strict as every variant's `class` (R5 strictest, R0 least), and the top-level `recommended_policy` is at least every variant's |
| V21 | Every residue item on a non-draft record, including variant residue, has `observed_by`. `probe` and `proxy` are allowed only when the record has a passing `sandbox_run` |
| V22 | `approval_text` is at most 120 characters and is required on non-draft R3 to R5 records. A variant that sets `class` to R3 to R5 sets its own non-null `approval_text`; a variant that sets R0 to R2 on an R3 to R5 record sets `approval_text: null`; a variant that doesn't set `class` on an R3 to R5 record doesn't set `approval_text: null` |
| V23 | Network check (`pnpm validate --quotes`): each `doc` evidence `quote` appears on its `url` after whitespace and punctuation normalization. It writes the SHA-256 of the normalized page text, keyed by URL, to `<repo>/.palin/quote-hashes.json` (override with `--hashes <path>`; tests write to a temporary directory), so a changed page shows up as a diff. Failures are warnings that list the record and URL |
| V24 | `tested` requires the provider's `terms.status: green` or a filled `terms.consent` (D13) |
