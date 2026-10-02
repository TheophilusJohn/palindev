import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMAIL_PATTERN, SECRET_PATTERNS, emailDomainAllowed, redactSecrets } from "../src/secrets.js";

const GUARD = fileURLToPath(new URL("../../../.claude/hooks/guard.mjs", import.meta.url));
// Fake secrets in this file say FAKE on their line.
const FAKE_STRIPE = "sk_test_FAKE0000000000000000"; // FAKE
const FAKE_AWS = "AKIAFAKE0000000000AB"; // FAKE

/** guard.mjs runs on import (it reads stdin and exits), so read its SECRET_PATTERNS array as text. */
function guardPatterns(): Array<[RegExp, string]> {
  const source = readFileSync(GUARD, "utf8");
  const match = /const SECRET_PATTERNS = (\[[\s\S]*?\n\]);/.exec(source);
  if (match?.[1] === undefined) throw new Error("SECRET_PATTERNS not found in guard.mjs");
  return new Function(`return ${match[1]};`)() as Array<[RegExp, string]>;
}

function domains(text: string): string[] {
  return [...text.matchAll(EMAIL_PATTERN)].map((match) => match[1] ?? "");
}

describe("secrets", () => {
  it("copies SECRET_PATTERNS from .claude/hooks/guard.mjs exactly", () => {
    const ours = SECRET_PATTERNS.map(([pattern, what]) => [pattern.source, pattern.flags, what]);
    const guard = guardPatterns().map(([pattern, what]) => [pattern.source, pattern.flags, what]);
    expect(ours).toEqual(guard);
  });

  it("allows example.com, example.org and .example domains in any case", () => {
    for (const domain of ["example.com", "EXAMPLE.ORG", "docs.acme.example"]) expect(emailDomainAllowed(domain), domain).toBe(true);
    for (const domain of ["example.net", "mail.example.com", "gmail.com", "example"]) expect(emailDomainAllowed(domain), domain).toBe(false);
  });

  it("allows the probe domain when one is given", () => {
    expect(emailDomainAllowed("probe.palin.dev", "probe.palin.dev")).toBe(true);
    expect(emailDomainAllowed("probe.palin.dev", " Probe.Palin.Dev ")).toBe(true);
    expect(emailDomainAllowed("probe.palin.dev", undefined)).toBe(false);
  });

  it("captures the domain of an email address, and not of a package spec", () => {
    expect(domains("write to a.b+c@mail.acme.io today")).toEqual(["mail.acme.io"]);
    expect(domains("john@acme.xn--p1ai and 123@123.com")).toEqual(["acme.xn--p1ai", "123.com"]);
    expect(domains("@acme/acme-mcp@1.8.1 pkg@2025.4.8 acme-sdk@2.0.0/dist")).toEqual([]);
  });

  it("redacts secrets and email local parts, and leaves other text alone", () => {
    expect(redactSecrets(`key ${FAKE_STRIPE} and ${FAKE_AWS}`)).toBe("key [a Stripe secret or restricted key] and [an AWS access key id]");
    expect(redactSecrets("mail alice@corp.io or bob@example.com")).toBe("mail …@corp.io or …@example.com");
    expect(redactSecrets("o'brien@corp.io first/last@corp.io")).toBe("…@corp.io …@corp.io");
    // Zero-width joiners belong to the name, so no fragment of it survives.
    expect(redactSecrets("ab‍cd@realcorp.io")).toBe("…@realcorp.io");
    // The address is redacted before the key in its domain, so the name part doesn't survive.
    expect(redactSecrets(`jane.doe@${FAKE_AWS}.com`)).toBe("…@[an AWS access key id].com");
    expect(redactSecrets("variants[0].when.args.send_email")).toBe("variants[0].when.args.send_email");
    // Redacting twice changes nothing more.
    expect(redactSecrets(redactSecrets(`x ${FAKE_STRIPE}`))).toBe("x [a Stripe secret or restricted key]");
  });
});
