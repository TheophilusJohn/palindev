# Decisions

Newest first. Add an entry whenever a choice would surprise someone reading the code later.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| D9 | 2026-09-30 | Agents never contact third parties (PRs, issues, posts, emails); they draft to files | Keeps every public action under the maintainer's name and judgment |
| D8 | 2026-09-30 | Unknown actions are treated as R5 by every surface | Conservative default; a missing record must never read as "safe" |
| D7 | 2026-09-30 | Sandbox only; actions testable only in production stay `documented` | Safety and vendor terms; no real money or real people involved |
| D6 | 2026-09-30 | Confidence ladder `tested > documented > community > draft`; only humans promote drafts | Honest labels are the product; LLM drafts must not look authoritative |
| D5 | 2026-09-30 | Six classes R0 to R5 with a fixed decision order, stricter class on ties | Finer than MCP's destructive flag, but still maps back to it for lint |
| D4 | 2026-09-30 | Code Apache-2.0; data CC BY-SA 4.0; CLA before accepting outside contributions | Open data that spreads, while closed commercial embedding needs a license |
| D3 | 2026-09-30 | JSON Schema is the source of truth; Ajv validates; types are generated | One definition shared by every language, including the Python SDK later |
| D2 | 2026-09-30 | The Git repo is the database; surfaces read a compiled bundle | Reviewable diffs, public history as the audit trail, no server to run |
| D1 | 2026-09-30 | Name Palin; domain palin.dev; npm scope `@palindev`; PyPI `palindev`; public repo github.com/TheophilusJohn/palindev | `palin` is taken on npm and PyPI, and the `@palin` npm org exists |
