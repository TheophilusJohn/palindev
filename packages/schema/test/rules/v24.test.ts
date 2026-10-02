import { describe, expect, it } from "vitest";
import type { PalinRecord } from "../../src/generated/record.js";
import { v24 } from "../../src/rules/v24.js";
import { NOW, base, fixtureTests, problemsOf } from "../helpers.js";

function tested(): PalinRecord {
  const record = base.r2();
  record.confidence = "tested";
  record.evidence.push({
    type: "sandbox_run",
    run_id: "2026-09-29T10-15-00Z_acme.tags.update_cd34ef",
    date: "2026-09-29",
    environment: "test_mode",
    result: "pass",
    observed_class: "R2",
    trace_sha256: "0123456789abcdef".repeat(4),
    trace_path: "runs/2026/09/2026-09-29T10-15-00Z_acme.tags.update_cd34ef.json",
    tested_on: { plan: "free", settings: {}, variant: null },
    vendor_paid: false,
  });
  return record;
}

describe("V24: tested needs green terms or written consent", () => {
  fixtureTests("V24", ["tags.update.yaml V24 confidence"]);

  it("accepts a tested record when the provider is green", () => {
    expect(problemsOf(tested())).toEqual([]);
  });

  it.each(["yellow", "red"] as const)("rejects %s terms without consent", (status) => {
    const provider = base.provider();
    provider.terms.status = status;
    expect(problemsOf(tested(), { provider })).toEqual(["V24 confidence"]);
  });

  it.each(["red", "yellow"] as const)("accepts %s terms with consent on file", (status) => {
    const provider = base.provider();
    provider.terms.status = status;
    provider.terms.consent = { date: "2026-09-01", from: "Head of developer relations", reference: "private/consent/acme.md" };
    expect(problemsOf(tested(), { provider })).toEqual([]);
  });

  it("doesn't apply below tested, and is skipped when the provider file is missing (V2 reports that)", () => {
    const provider = base.provider();
    provider.terms.status = "red";
    expect(problemsOf(base.r2(), { provider })).toEqual([]);
    expect(v24(tested(), { now: NOW, provider: undefined })).toEqual([]);
  });
});
