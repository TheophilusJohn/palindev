---
name: write-finding
description: Draft a short, factual public post about a Palin finding, such as an undo that doesn't fully undo or an annotation that's wrong. Drafts only; never posts.
argument-hint: <record id or lint report> "<what was surprising>"
disable-model-invocation: true
---

# Draft a finding post

Input: $ARGUMENTS

1. Read the record (or lint report) and its evidence. The post may only state what the evidence shows. If the record is `draft`, stop: findings are only written for `documented` or `tested` records.
2. **Terms gate (D13).** Read `terms` in `data/<provider>/_provider.yaml` for every provider the post names. If `status` isn't `green` and `consent` is empty, stop: no findings about that provider without written consent.
3. **Security issues.** If the finding is security-relevant (for example, it exposes data or gets around an access control), stop: it goes through the vendor's disclosure program, not a post. Draft the report for that program at `private/disclosures/<YYYY-MM-DD>-<id>.md` (gitignored), never in `content/` or any tracked file, and tell the maintainer.
4. **Right of reply (D13).** If the finding contradicts the vendor's docs, first draft a right-of-reply email to the vendor at `private/right-of-reply/<YYYY-MM-DD>-<id>.md`: what we observed, the evidence, the doc passage it contradicts, and an offer to correct the record. Write that finding's post draft in the same folder, at `private/right-of-reply/<YYYY-MM-DD>-<id>-post.md`, starting with: `Hold: publish no earlier than 14 days after the maintainer sends the right-of-reply email (D13).` Move it to `content/findings/` only after the maintainer has noted the sent date and 14 days have passed.
5. Write the post draft (at `content/findings/<YYYY-MM-DD>-<id>.md`, or where step 4 says for a held finding) with:
   - **Short version** (under 280 characters) for X and Bluesky.
   - **Long version** (under 150 words) for LinkedIn and Reddit: what the action is, what people might assume, what actually happens, and what an agent should do instead.
   - **Link:** `https://palin.dev/a/<id>`
   - **Evidence:** the doc URLs or run id backing each claim. Point to redacted traces; never paste raw vendor payloads.
6. Tone: plain and factual. No hype words, no vendor-bashing, no claims beyond the evidence. For residue, say "in our sandbox test" only when its `observed_by` is `probe` or `proxy`, and for `proxy` name the stand-in that was seen (for example, the notification email). Residue with `observed_by: doc` is attributed to the vendor's docs. For the state change and undo, say it only when the record is `tested`, and give the run date.
7. Don't post or send anything. The maintainer posts and sends.
