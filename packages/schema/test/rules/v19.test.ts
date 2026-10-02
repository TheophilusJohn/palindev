import { describe, expect, it } from "vitest";
import type { PalinRecord } from "../../src/generated/record.js";
import { missingForPromotion } from "../../src/rules/v19.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

function draft(record: PalinRecord): PalinRecord {
  record.confidence = "draft";
  delete record.last_verified;
  return record;
}

describe("V19: a draft names every missing field in a todo", () => {
  fixtureTests("V19", ["invoices.get.yaml V19 summary"]);

  it("accepts a draft that names what it leaves out", () => {
    const record = draft(base.r3());
    delete record.approval_text;
    delete record.api_version;
    record.evidence.push(
      { type: "todo", field: "approval_text", note: "Write it once the residue is reviewed." },
      { type: "todo", field: "api_version", note: "Find the documented version." },
    );
    expect(problemsOf(record)).toEqual([]);
  });

  it("needs approval_text named on an R3 to R5 draft", () => {
    const record = draft(base.r5());
    delete record.approval_text;
    expect(problemsOf(record)).toEqual(["V19 approval_text"]);
  });

  it("needs each missing sub-key of flags, undo and suggested_annotations named by its dotted path", () => {
    const record = draft(base.r2());
    delete record.flags?.bulk;
    delete record.undo?.capture;
    delete record.suggested_annotations?.openWorldHint;
    record.evidence.push({ type: "todo", field: "flags", note: "A parent path doesn't cover its sub-keys." });
    expect(problemsOf(record)).toEqual(["V19 flags.bulk", "V19 undo.capture", "V19 suggested_annotations.openWorldHint"]);
  });

  it("needs residue observed_by and a variant's approval_text named, where V21 and V22 require them", () => {
    const record = draft(base.r3());
    delete record.residue?.[0]?.observed_by;
    record.variants = [{ when: { args: { send_email: false } }, class: "R2", flags: { reaches_third_parties: false }, residue: [], recommended_policy: "allow_and_log" }];
    expect(missingForPromotion(record)).toEqual(["residue[0].observed_by", "variants[0].approval_text"]);
    expect(problemsOf(record)).toEqual(["V19 residue[0].observed_by", "V19 variants[0].approval_text"]);
  });

  it("needs variant residue observed_by named too", () => {
    const record = draft(base.r3());
    record.variants = [{ when: { plan: "free" }, residue: [{ kind: "email", audience: "external", note: "Emailed." }] }];
    expect(problemsOf(record)).toEqual(["V19 variants[0].residue[0].observed_by"]);
  });

  it("doesn't ask for last_verified, and doesn't apply to non-drafts", () => {
    expect(problemsOf(draft(base.r0()))).toEqual([]);
    // A schema-valid non-draft missing approval_text: V22 reports it, V19 stays out.
    const record = base.r3();
    delete record.approval_text;
    expect(problemsOf(record)).toEqual(["V22 approval_text"]);
  });
});
