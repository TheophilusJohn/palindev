---
paths:
  - "packages/harness/**"
  - "tests/actions/**"
  - "apps/probes/**"
  - "runs/**"
---

# Rules for the harness, action tests, probes and traces

- Follow `docs/HARNESS.md`. The Safety section, including its GitHub and AWS subsections, is mandatory, not optional.
- Mock mode is the default and must need no network or credentials. Every action test must pass in mock mode in CI.
- Sandbox mode is only run by the maintainer (`/verify-action`). Don't run `--sandbox` yourself unless asked in this session.
- Terms gate: a sandbox run refuses to start unless the provider's `_provider.yaml` has `terms.status: green` or a filled `terms.consent` (D13, V24). Don't write action tests for a provider that has neither.
- For AWS (D14), preflight refuses unless STS `GetCallerIdentity` returns the allowlisted sandbox account and `DescribeOrganization` returns `AWS_SANDBOX_ORG_ID`, and refuses the Organization's management account. It fails closed: any DescribeOrganization error (AccessDenied, AWSOrganizationsNotInUseException, network) refuses the run. The service control policy allows `sts:GetCallerIdentity` and `organizations:DescribeOrganization` in every region.
- Every AWS client gets explicit `credentials` and `region` from `AWS_SANDBOX_*` and `ignoreConfiguredEndpointUrls: true`. At startup the harness sets `AWS_EC2_METADATA_DISABLED=true`, points `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` at a nonexistent path, and deletes `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` and `AWS_ENDPOINT_URL*` from `process.env`; never read `~/.aws`. The teardown script is a Node entry point that reuses that client and the full preflight, never the AWS CLI, and deletes only `palin-test-` resources.
- For GitHub (D25), the harness acts only as the GitHub App installed on the test org and observes only through the one dedicated machine account. Never use the maintainer's personal account or a personal token for acting. Preflight refuses the hard-coded denylist (`TheophilusJohn`, the `palindev` org), checks with the App JWT that `GET /app/installations` returns one installation, on the test org, and checks the observer's `GET /user` login and that `GET /user/orgs` lists only the test org. The client allows only `/repos/<test-org>/`, `/orgs/<test-org>/` and the owner-less calls listed in `docs/HARNESS.md`, refuses `/graphql` and id-based routes, and the observer client sends GET requests only.
- Secrets come only from `process.env`, the GitHub App private key included (base64 in `GITHUB_APP_PRIVATE_KEY_B64`); never read key files. Never log secrets, never put them in traces, fixtures, snapshots or error messages.
- Everything a test creates is named `palin-test-…` and cleaned up in `cleanup`, which must run even after failures.
- Update and delete calls may only target ids created in the same run.
- Call vendor APIs only. Never script a browser session as an account owner; an undo that works only in the vendor's UI or admin console stays `documented`.
- Each provider declares what its probes can see in `packages/harness/src/providers/<provider>/capabilities.ts`. A missing event is evidence of no residue only on a channel declared `probe` there. Every residue item in a trace carries `observed_by` (`probe`, `proxy` or `doc`).
- Traces hold only request method, path and status, state hashes, snapshot-field diffs and residue summaries. Never raw vendor response payloads, webhook bodies or email bodies.
- Traces in `runs/` are redacted before hashing; never edit a committed trace (its hash is evidence).
- Only sandbox `pass` traces go to `runs/YYYY/MM/`. `fail` and `inconclusive` traces, and a `pass` trace that shows residue the record doesn't list, go to `runs/raw/` (gitignored) until the maintainer decides. A doc-contradicting change goes only on a local-only `embargo/<YYYY-MM-DD>-<id>` branch, never on a batch branch that gets pushed, and its trace joins that branch (moving to `runs/YYYY/MM/`) only when the maintainer releases it; a security-relevant trace stays in `runs/raw/` until the disclosure closes (D22).
- Mailbox probe storage holds verification links and magic codes: redact before storing (subject lines included), never store bodies or attachments, never forward mail, expire within 24 hours, and get a `security-reviewer` pass on the mailbox Worker before first use. The Worker never logs message content, headers or unredacted subjects (Workers Logs and Logpush off) and drops messages not addressed to an active run tag. Sandbox account-recovery and root email addresses are never on the probe domain.
- A webhook the harness registers has a secret and never points at a third-party request bin; for a delivery-log probe it points at a maintainer-controlled endpoint that stores nothing, or at a URL that refuses connections. Only delivery summaries reach the trace.
- A mock result is never evidence. Mock runs write traces only to `.harness-tmp/`, marked `"mode": "mock"`, and `pnpm harness evidence` refuses them. Only sandbox runs produce `sandbox_run` items.
- Changes here get a `security-reviewer` pass before commit.
