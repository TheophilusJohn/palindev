import { EMAIL_PATTERN, SECRET_PATTERNS, emailDomainAllowed } from "../secrets.js";

export interface TextFinding {
  /** 1-based. */
  line: number;
  col: number;
  /** Offset of the match in the text, for mapping it to a YAML field. */
  offset: number;
  message: string;
}

export interface V16Options {
  /** Allowed besides the example domains; from PALIN_PROBE_MAIL_DOMAIN. */
  probeMailDomain?: string | undefined;
  /** Look for secrets only, not email addresses (for the raw bytes of binary files). */
  secretsOnly?: boolean;
}

/**
 * V16: no secret (guard.mjs SECRET_PATTERNS, with no FAKE exemption) and no email address outside
 * example.com, example.org, *.example and the probe domain. Messages name the kind of secret, or an
 * address's domain as written; the validator redacts every problem before it's reported.
 */
export function v16(text: string, options: V16Options = {}): TextFinding[] {
  const findings: TextFinding[] = [];
  let offset = 0;
  text.split("\n").forEach((line, index) => {
    for (const [pattern, what] of SECRET_PATTERNS) {
      const match = pattern.exec(line);
      if (match !== null) {
        findings.push({
          line: index + 1,
          col: match.index + 1,
          offset: offset + match.index,
          message: `looks like ${what}; remove it (V16 has no FAKE exemption)`,
        });
      }
    }
    if (options.secretsOnly !== true) {
      for (const match of line.matchAll(EMAIL_PATTERN)) {
        // The domain keeps its case, so redaction still recognizes a key hidden in it.
        const domain = match[1] ?? "";
        if (!emailDomainAllowed(domain, options.probeMailDomain)) {
          findings.push({
            line: index + 1,
            col: match.index + 1,
            offset: offset + match.index,
            message: `has an email address on ${domain}; use example.com, example.org, a .example domain or the probe domain`,
          });
        }
      }
    }
    offset += line.length + 1;
  });
  // Patterns such as an AWS secret access key allow whitespace between the key name and the value,
  // so the value can sit on the next line: scan the whole text for matches that cross a line break.
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) lineStarts.push(index + 1);
  for (const [pattern, what] of SECRET_PATTERNS) {
    let line = 0; // matches come in order, so the line only moves forward
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      if (!match[0].includes("\n")) continue; // single-line matches are found above
      while (line + 1 < lineStarts.length && (lineStarts[line + 1] ?? Infinity) <= match.index) line += 1;
      findings.push({
        line: line + 1,
        col: match.index - (lineStarts[line] ?? 0) + 1,
        offset: match.index,
        message: `looks like ${what}; remove it (V16 has no FAKE exemption)`,
      });
    }
  }
  return findings;
}
