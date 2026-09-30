---
name: write-finding
description: Draft a short, factual public post about a Palin finding, such as an undo that doesn't fully undo or an annotation that's wrong. Drafts only; never posts.
argument-hint: <record id or lint report> "<what was surprising>"
disable-model-invocation: true
---

# Draft a finding post

Input: $ARGUMENTS

1. Read the record (or lint report) and its evidence. The post may only state what the evidence shows. If the record is `draft`, stop: findings are only written for `documented` or `tested` records.
2. Write `content/findings/<YYYY-MM-DD>-<id>.md` with:
   - **Short version** (under 280 characters) for X and Bluesky.
   - **Long version** (under 150 words) for LinkedIn and Reddit: what the action is, what people might assume, what actually happens, and what an agent should do instead.
   - **Link:** `https://palin.dev/a/<id>`
   - **Evidence:** the doc URLs or run id backing each claim.
3. Tone: plain and factual. No hype words, no vendor-bashing, no claims beyond the evidence. Say "in our sandbox test" when the source is a run.
4. Don't post anything. The maintainer posts.
