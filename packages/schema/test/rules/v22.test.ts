import { describe, expect, it } from "vitest";
import type { PalinRecord, Variant } from "../../src/generated/record.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

const R2_VARIANT: Variant = {
  when: { args: { send_email: false } },
  class: "R2",
  flags: { reaches_third_parties: false },
  residue: [],
  recommended_policy: "allow_and_log",
};

function withVariant(record: PalinRecord, variant: Variant): PalinRecord {
  record.variants = [variant];
  return record;
}

describe("V22: approval text", () => {
  fixtureTests("V22", ["invoices.send.yaml V22 approval_text"]);

  it("allows 120 characters and rejects 121", () => {
    const record = base.r3();
    record.approval_text = "x".repeat(120);
    expect(problemsOf(record)).toEqual([]);
    record.approval_text = "x".repeat(121);
    expect(problemsOf(record)).toEqual(["V22 approval_text"]);
  });

  it("isn't required below R3", () => {
    expect(problemsOf(base.r2())).toEqual([]);
  });

  it("needs an R3 to R5 variant to set its own non-null text", () => {
    const record = withVariant(base.r3(), { when: { plan: "free" }, class: "R4", undo: base.r4().undo as Variant["undo"] });
    expect(problemsOf(record)).toContain("V22 variants[0].approval_text");
    const nulled = withVariant(base.r3(), { when: { plan: "free" }, class: "R3", approval_text: null });
    expect(problemsOf(nulled)).toEqual(["V22 variants[0].approval_text"]);
  });

  it("needs an R0 to R2 variant of an R3 to R5 record to set approval_text: null explicitly", () => {
    expect(problemsOf(withVariant(base.r3(), R2_VARIANT))).toEqual(["V22 variants[0].approval_text"]);
    expect(problemsOf(withVariant(base.r3(), { ...R2_VARIANT, approval_text: "Finalizes the invoice quietly." }))).toEqual([
      "V22 variants[0].approval_text",
    ]);
    expect(problemsOf(withVariant(base.r3(), { ...R2_VARIANT, approval_text: null }))).toEqual([]);
  });

  it("limits a variant's own text to 120 characters", () => {
    expect(problemsOf(withVariant(base.r3(), { when: { plan: "free" }, approval_text: "y".repeat(121) }))).toEqual(["V22 variants[0].approval_text"]);
  });

  it("doesn't let a variant that inherits R3 to R5 clear the text with null, even in a draft", () => {
    expect(problemsOf(withVariant(base.r3(), { when: { plan: "free" }, approval_text: null }))).toEqual(["V22 variants[0].approval_text"]);
    expect(problemsOf(withVariant(base.r3(), { when: { plan: "free" } }))).toEqual([]);
    expect(problemsOf(withVariant(base.r3(), { when: { plan: "free" }, approval_text: "Emails the customer on the free plan too." }))).toEqual([]);
    const record = withVariant(base.r3(), { when: { plan: "free" }, approval_text: null });
    record.confidence = "draft";
    delete record.last_verified;
    expect(problemsOf(record)).toEqual(["V22 variants[0].approval_text"]);
  });

  it("skips absent keys in a draft, where V19 asks for a todo instead", () => {
    const record = withVariant(base.r3(), R2_VARIANT);
    record.confidence = "draft";
    delete record.last_verified;
    record.evidence.push({ type: "todo", field: "variants[0].approval_text", note: "Decide once the variant is reviewed." });
    expect(problemsOf(record)).toEqual([]);
  });
});
