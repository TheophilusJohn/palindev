# Palin

**Can an AI agent undo this?** Palin is an open, tested database of what happens when an agent calls a real SaaS API action: whether it can be undone, how, for how long, and what escapes before the undo.

> **Status: pre-alpha.** Building in public. Nothing here is authoritative yet. Website: [palin.dev](https://palin.dev)

## Why

MCP lets a server label its own tools as read-only or destructive, but the spec tells clients to treat those labels as untrusted. A yes-or-no flag also can't say that an undo only works for 30 days, or that a deleted message already notified everyone. Palin publishes tested, cross-vendor answers, with evidence anyone can check.

## Reversibility classes

| Class | Name | Meaning |
| --- | --- | --- |
| R0 | Read-only | No state change |
| R1 | Read with side effects | Minor metadata changes, such as read markers |
| R2 | Clean undo | An exact undo exists and nothing escapes |
| R3 | Undo with residue | Undo exists, but something escapes first (emails, notifications, fees) |
| R4 | Time-boxed undo | Undo works only inside a window |
| R5 | Irreversible | No vendor-supported way back |

Every record also carries a confidence level: `tested` (observed in a vendor sandbox), `documented` (cited vendor docs, reviewed), `community` (reviewed report) or `draft`.

## What a record looks like

```yaml
id: acme.invoices.send        # fictional example
class: R3
recommended_policy: confirm
undo:
  method: inverse_call
residue:
  - kind: email
    audience: external
    note: The customer is emailed immediately; voiding sends a second email.
confidence: tested
```

The full format is in [docs/SCHEMA.md](docs/SCHEMA.md).

## Planned surfaces

- This data repo
- Website with a page per action
- MCP server agents call before acting (`@palindev/mcp`)
- `palin lint` to check MCP tool annotations, plus a GitHub Action
- TypeScript and Python SDKs with a `guard()` helper

## Contributing

Not open for outside contributions yet; a contributor agreement and guidelines arrive before launch. Issues are welcome.

## License

Code: [Apache-2.0](LICENSE). Data in `data/`: [CC BY-SA 4.0](data/LICENSE). For embedding the data in a closed commercial product, a separate license will be offered at palin.dev.

Records are advisory and provided without warranty. You remain responsible for your own approval policies.
