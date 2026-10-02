import { describe, expect, it } from "vitest";
import type { PalinRecord, SandboxRunEvidence } from "../../src/generated/record.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

function run(overrides: Partial<SandboxRunEvidence> = {}): SandboxRunEvidence {
  return {
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
    ...overrides,
  };
}

function tested(...runs: SandboxRunEvidence[]): PalinRecord {
  const record = base.r2();
  record.confidence = "tested";
  record.evidence = [record.evidence[0], ...runs];
  return record;
}

describe("V3: tested needs a passing run of the default call", () => {
  fixtureTests("V3", ["tags.update.yaml V3 confidence"]);

  it("accepts a passing default-call run whose observed class matches", () => {
    expect(problemsOf(tested(run()))).toEqual([]);
  });

  it("rejects a passing run whose observed class differs", () => {
    expect(problemsOf(tested(run({ observed_class: "R3" })))).toEqual(["V3 confidence"]);
  });

  it("rejects a record whose only passing run exercised a variant", () => {
    const record = tested(run({ tested_on: { plan: "free", settings: {}, variant: 0 } }));
    record.variants = [{ when: { args: { color: "red" } } }];
    expect(problemsOf(record)).toEqual(["V3 confidence"]);
  });

  it("doesn't apply below tested", () => {
    const record = base.r2();
    record.evidence = [record.evidence[0], run({ result: "inconclusive" })];
    expect(problemsOf(record)).toEqual([]);
  });
});
