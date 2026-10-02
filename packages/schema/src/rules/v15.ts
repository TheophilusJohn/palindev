import { checkUrl, isIsoDate, isIsoDuration, wordCount } from "../formats.js";
import type { ProviderFile } from "../generated/provider.js";
import type { PalinRecord } from "../generated/record.js";
import type { Issue } from "../problems.js";

const MAX_QUOTE_WORDS = 40;

class Checks {
  readonly issues: Issue[] = [];

  url(path: string, value: string | null | undefined): void {
    if (value === null || value === undefined) return;
    const result = checkUrl(value);
    if (result === "http") this.issues.push({ path, message: "must use https://" });
    else if (result === "invalid") this.issues.push({ path, message: "isn't a valid https:// URL" });
  }

  date(path: string, value: string | undefined): void {
    if (value !== undefined && !isIsoDate(value)) this.issues.push({ path, message: "must be a real date written YYYY-MM-DD" });
  }

  duration(path: string, value: string | null | undefined): void {
    if (typeof value === "string" && !isIsoDuration(value)) {
      this.issues.push({ path, message: "must be an ISO 8601 duration such as P30D or PT1H" });
    }
  }

  quote(path: string, value: string): void {
    const words = wordCount(value);
    if (words > MAX_QUOTE_WORDS) {
      this.issues.push({ path, message: `has ${words} words; a doc quote is ${MAX_QUOTE_WORDS} words or fewer` });
    }
  }

  /** Record and provider evidence items share these fields. */
  evidence(items: readonly object[]): void {
    items.forEach((raw, index) => {
      const item = raw as Record<string, unknown>;
      const at = `evidence[${index}]`;
      if (typeof item.url === "string") this.url(`${at}.url`, item.url);
      if (typeof item.retrieved === "string") this.date(`${at}.retrieved`, item.retrieved);
      if (typeof item.date === "string") this.date(`${at}.date`, item.date);
      if (item.type === "doc" && typeof item.quote === "string") this.quote(`${at}.quote`, item.quote);
    });
  }
}

/**
 * V15 for a record: every URL uses https://, every date is YYYY-MM-DD, `window` is an ISO 8601
 * duration, and each doc quote is at most 40 words.
 */
export function v15Record(record: PalinRecord): Issue[] {
  const checks = new Checks();
  checks.evidence(record.evidence);
  checks.date("last_verified", record.last_verified);
  checks.duration("undo.window", record.undo?.window);
  record.variants?.forEach((variant, index) => checks.duration(`variants[${index}].undo.window`, variant.undo?.window));
  return checks.issues;
}

/** V15 for `_provider.yaml`: URLs, dates and doc quotes. */
export function v15Provider(provider: ProviderFile): Issue[] {
  const checks = new Checks();
  checks.url("docs_url", provider.docs_url);
  checks.url("api_reference_url", provider.api_reference_url);
  checks.url("openapi_url", provider.openapi_url);
  checks.url("changelog_url", provider.changelog_url);
  checks.url("terms_url", provider.terms_url);
  checks.date("terms.consent.date", provider.terms.consent?.date);
  checks.url("sandbox.signup_url", provider.sandbox.signup_url);
  checks.evidence(provider.evidence);
  checks.date("last_reviewed", provider.last_reviewed);
  return checks.issues;
}
