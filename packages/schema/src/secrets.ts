// Rule V16's patterns. SECRET_PATTERNS is a copy of the list in .claude/hooks/guard.mjs, which has to
// run without a pnpm install; test/secrets.test.ts fails if the two drift apart. Unlike the guard,
// V16 has no FAKE exemption.

export const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/, "a Stripe secret or restricted key"],
  [/\bpk_live_[A-Za-z0-9]{16,}/, "a Stripe live publishable key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, "a GitHub fine-grained token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bASIA[0-9A-Z]{16}\b/, "a temporary AWS access key id"],
  [/secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9\/+]{40}(?![A-Za-z0-9\/+])/i, "an AWS secret access key"],
  [/session_?token["']?\s*[:=]\s*["']?[A-Za-z0-9\/+=]{100,}/i, "an AWS session token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
  [/\blin_api_[A-Za-z0-9]{20,}/, "a Linear API key"],
  [/\b(secret|ntn)_[A-Za-z0-9]{40,}/, "a Notion token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];

/**
 * An email address; group 1 is the domain, whose last label starts with a letter (so package specs
 * such as pkg@1.4.2 don't count). The name part takes letters with their combining marks, digits and
 * the symbols an address may use unquoted; the lookbehind keeps a long run of them linear. Quoted
 * names and IP-literal domains aren't matched.
 */
export const EMAIL_PATTERN =
  /(?<![\p{L}\p{M}\p{N}‌‍!#$%&'*+/=?^_`{|}~.-])[\p{L}\p{M}\p{N}‌‍!#$%&'*+/=?^_`{|}~.-]+@((?:[\p{L}\p{M}\p{N}‌‍-]+\.)+\p{L}[\p{L}\p{M}\p{N}‌‍-]*)/gu;

/** example.com, example.org, any *.example domain, or the probe domain when one is set. */
export function emailDomainAllowed(domain: string, probeMailDomain?: string): boolean {
  const name = domain.toLowerCase();
  if (name === "example.com" || name === "example.org" || name.endsWith(".example")) return true;
  const probe = probeMailDomain?.trim().toLowerCase();
  return probe !== undefined && probe !== "" && name === probe;
}

const GLOBAL_PATTERNS = SECRET_PATTERNS.map(([pattern, what]) => [new RegExp(pattern.source, `${pattern.flags}g`), what] as const);

/**
 * Replaces anything secret-shaped with `[<what it looks like>]` and the local part of every email
 * address with `…`. Applied to every problem the validator reports, so a secret used as a key, a
 * file name or an alias name never reaches the output.
 */
export function redactSecrets(text: string): string {
  // Addresses first: a key hidden in a domain, once replaced, would stop the address from matching.
  let out = text.replace(EMAIL_PATTERN, (_match, domain: string) => `…@${domain}`);
  for (const [pattern, what] of GLOBAL_PATTERNS) out = out.replace(pattern, `[${what}]`);
  return out;
}
