# Palin

**Can an AI agent undo this?** Palin is independent, re-verified evidence of what agent actions on real SaaS APIs actually do: what escapes, whether and how it can be undone, and for how long. Every answer comes with receipts: a quoted vendor doc for each field, or a sandbox run with a hashed trace.

> **Status: pre-alpha.** Building in public. Nothing here is authoritative yet, and there are no records yet. First scope: GitHub (REST, `gh` CLI and MCP tools) and AWS actions that destroy data. The website, palin.dev, isn't live yet.

## Why

MCP lets a server label its own tools as read-only or destructive, but the spec tells clients to treat those labels as untrusted. A yes-or-no flag also can't say that an undo only works for 30 days, that a deleted message already notified everyone, or that the same tool is harmless with one argument and irreversible with another. Many real agent incidents run through a shell or CLI, where there are no labels at all. Palin records what actually happens, tested in vendor sandboxes where the vendor's terms allow it, with evidence anyone can check.

Palin is independent. Vendor-paid verification is disclosed on the record and can't change the result, and a finding that contradicts a vendor's docs goes to that vendor first, with 14 days to reply.

## Reversibility classes

| Class | Name | Meaning |
| --- | --- | --- |
| R0 | Read-only | No state change |
| R1 | Read with side effects | Minor metadata changes, such as read markers |
| R2 | Clean undo | An exact undo exists and nothing escapes |
| R3 | Undo with residue | Undo exists, but something escapes first (emails, notifications, fees) |
| R4 | Time-boxed undo | Undo works only inside a window |
| R5 | Irreversible | No vendor-supported way back |

Every record also carries a confidence level: `tested` (observed in a vendor sandbox on a named date), `documented` (cited vendor docs, reviewed), `community` (reviewed report) or `draft`. A tested record whose newest passing run is more than 90 days old is shown as `tested_stale`, with its last observed date. Each residue item says how it is known: a probe saw it in a sandbox run (`probe`), a run saw a stand-in for it (`proxy`), or it comes from docs only (`doc`).

## What a record looks like

```yaml
id: acme.invoices.send        # fictional example
class: R3
undo:
  method: inverse_call        # void the invoice
residue:
  - kind: email
    audience: external
    note: The customer is emailed immediately; voiding sends a second email.
    observed_by: probe        # the harness mailbox probe saw it
  - kind: audit_log
    audience: vendor
    note: The send is recorded in the account's event log.
    observed_by: doc          # no probe watched this channel
recommended_policy: confirm
approval_text: Emails the customer now; voiding later sends a second email.
confidence: tested
```

Records also carry flags, MCP tool and CLI aliases, argument variants and the evidence behind each field. The full format is in [docs/SCHEMA.md](docs/SCHEMA.md).

## Planned surfaces

All of them read one bundle compiled from the records in this repo.

- A Claude Code plugin whose PreToolUse hook checks MCP tool calls and `gh` and `aws` commands before they run. It answers `ask` or `deny` with what escapes and how to undo it, never `allow`, and never reports an action without a record as safe
- palin.dev, with a page per record that shows where each residue item comes from, plus the redacted traces for tested records
- Later, when a partner asks for them: an MCP server agents call before acting (`@palindev/mcp`), `palin lint` for MCP tool annotations, TypeScript and Python SDKs with a `guard()` helper, and exporters for other agent hosts

## Prior art

- **GoEX** (UC Berkeley, 2024): a runtime design for LLM agents that act on real systems, with undo and damage confinement.
- **Revoco**: open-source registries of inverse actions.
- **PolicyLayer**: a heuristic risk registry for MCP tools.

Palin differs in what backs each answer: sandbox tests against the real vendor API, a citation for each field, and residue typed by kind and audience that records whether a probe saw it or it comes from docs.

## Contributing

Not open for outside contributions yet; a contributor agreement and guidelines arrive before launch. Issues are welcome.

## License

Code: [Apache-2.0](LICENSE). Data in `data/`: [CC BY 4.0](data/LICENSE), which allows commercial use with attribution. Quotes from vendor documentation inside records belong to their owners and are not covered by that grant. Commercial data feeds with freshness commitments are planned but not available yet.

Records are advisory and provided without warranty. You remain responsible for your own approval policies.
