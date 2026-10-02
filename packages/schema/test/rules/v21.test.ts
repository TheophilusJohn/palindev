import { describe, expect, it } from "vitest";
import type { SandboxRunEvidence } from "../../src/generated/record.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

const PASSING_RUN: SandboxRunEvidence = {
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
};

describe("V21: residue says how it's known, honestly", () => {
  fixtureTests("V21", ["tags.update.yaml V21 residue[0].observed_by"]);

  it("rejects probe or proxy without a passing sandbox run", () => {
    const record = base.r2();
    record.residue = [{ kind: "webhook", audience: "actor", note: "An event is delivered.", observed_by: "probe" }];
    expect(problemsOf(record)).toEqual(["V21 residue[0].observed_by"]);
    record.evidence.push({ ...PASSING_RUN, result: "fail" });
    expect(problemsOf(record)).toEqual(["V21 residue[0].observed_by"]);
  });

  it("accepts probe and proxy once the record has a passing run", () => {
    const record = base.r2();
    record.residue = [
      { kind: "webhook", audience: "actor", note: "An event is delivered.", observed_by: "probe" },
      { kind: "audit_log", audience: "vendor", note: "The change is logged.", observed_by: "proxy" },
    ];
    record.evidence.push(PASSING_RUN);
    expect(problemsOf(record)).toEqual([]);
  });

  it("checks variant residue too", () => {
    const record = base.r3();
    record.variants = [{ when: { plan: "free" }, residue: [{ kind: "email", audience: "external", note: "Emailed." }] }];
    expect(problemsOf(record)).toEqual(["V21 variants[0].residue[0].observed_by"]);
  });

  it("leaves a draft's missing observed_by to V19", () => {
    const record = base.r2();
    record.confidence = "draft";
    delete record.last_verified;
    record.residue = [{ kind: "webhook", audience: "actor", note: "An event is delivered." }];
    expect(problemsOf(record)).toEqual(["V19 residue[0].observed_by"]);
  });
});
