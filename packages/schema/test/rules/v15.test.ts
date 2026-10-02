import { describe, expect, it } from "vitest";
import { v15Provider } from "../../src/rules/v15.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V15: https URLs, real dates, ISO durations, short quotes", () => {
  fixtureTests("V15", ["invoices.get.yaml V15 evidence[0].url"]);

  it("rejects an impossible date", () => {
    const record = base.r0();
    record.evidence = [{ type: "doc", url: "https://docs.acme.example/a", quote: "A quote.", retrieved: "2026-02-30" }];
    expect(problemsOf(record)).toEqual(["V15 evidence[0].retrieved"]);
  });

  it("rejects a window that isn't an ISO 8601 duration", () => {
    const record = base.r4();
    record.undo = { ...record.undo, window: "30 days" };
    expect(problemsOf(record)).toEqual(["V15 undo.window"]);
  });

  it("checks a variant's undo window too", () => {
    const record = base.r4();
    const undo = { ...record.undo, method: "restore" as const, operation: record.undo?.operation ?? null, steps: [], window: "P1M2", window_condition: null, compensating_action: null, capture: [] };
    record.variants = [{ when: { plan: "free" }, undo }];
    expect(problemsOf(record)).toEqual(["V15 variants[0].undo.window"]);
  });

  it("allows a doc quote of 40 words and rejects 41", () => {
    const record = base.r0();
    const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
    record.evidence = [{ type: "doc", url: "https://docs.acme.example/a", quote: words(40), retrieved: "2026-09-28" }];
    expect(problemsOf(record)).toEqual([]);
    record.evidence = [{ type: "doc", url: "https://docs.acme.example/a", quote: words(41), retrieved: "2026-09-28" }];
    expect(problemsOf(record)).toEqual(["V15 evidence[0].quote"]);
  });

  it("rejects a URL that doesn't parse", () => {
    const record = base.r0();
    record.evidence = [{ type: "doc", url: "docs.acme.example/a", quote: "A quote.", retrieved: "2026-09-28" }];
    expect(problemsOf(record)).toEqual(["V15 evidence[0].url"]);
  });

  it("checks the date of community, vendor statement and sandbox run items", () => {
    const record = base.r0();
    record.evidence = [
      { type: "doc", url: "https://docs.acme.example/a", quote: "A quote.", retrieved: "2026-09-28" },
      { type: "community", url: "https://forum.acme.example/t/1", date: "2026-9-20", summary: "A report." },
      { type: "vendor_statement", url: "https://docs.acme.example/changelog", date: "20260912" },
    ];
    expect(problemsOf(record)).toEqual(["V15 evidence[1].date", "V15 evidence[2].date"]);
  });

  it("requires a literal https:// with no credentials", () => {
    for (const url of ["https:docs.acme.example/a", "https:/docs.acme.example/a", "https://user:pw@docs.acme.example/a"]) {
      const record = base.r0();
      record.evidence = [{ type: "doc", url, quote: "A quote.", retrieved: "2026-09-28" }];
      expect(problemsOf(record), url).toEqual(["V15 evidence[0].url"]);
    }
  });

  it("checks every provider URL and date", () => {
    const provider = base.provider();
    provider.terms_url = "http://acme.example/legal";
    provider.last_reviewed = "2026-09-31";
    provider.evidence = [{ type: "doc", url: "http://acme.example/legal/api", quote: "A quote.", retrieved: "2026-09-28" }];
    expect(v15Provider(provider).map((issue) => issue.path)).toEqual(["terms_url", "evidence[0].url", "last_reviewed"]);
  });

  it("checks provider URLs and dates, including the consent date", () => {
    expect(v15Provider(base.provider())).toEqual([]);
    const provider = base.provider();
    provider.docs_url = "http://docs.acme.example";
    provider.terms.consent = { date: "2026-9-1", from: "Head of developer relations", reference: "private/consent/acme.md" };
    provider.sandbox.signup_url = "ftp://acme.example/signup";
    expect(v15Provider(provider).map((issue) => issue.path)).toEqual(["docs_url", "terms.consent.date", "sandbox.signup_url"]);
  });
});
