import { describe, expect, it } from "vitest";
import { v7Class } from "../../src/rules/v7.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V7: R0 changes nothing, R1 modifies nothing existing", () => {
  fixtureTests("V7", ["invoices.get.yaml V7 flags.modifies_existing"]);

  it("rejects residue on R0", () => {
    const record = base.r0();
    record.residue = [{ kind: "audit_log", audience: "vendor", note: "The call is logged.", observed_by: "doc" }];
    expect(problemsOf(record)).toEqual(["V7 residue"]);
  });

  it.each(["moves_money", "reaches_third_parties", "changes_permissions", "bulk"] as const)("rejects %s on R0", (flag) => {
    const record = base.r0();
    record.flags = { ...record.flags, [flag]: true };
    expect(problemsOf(record)).toContain(`V7 flags.${flag}`);
  });

  it("reports R0's undo method under V7 and V11, as SCHEMA.md lists it under both", () => {
    const record = base.r0();
    record.undo = { ...record.undo, method: "none" };
    expect(problemsOf(record)).toEqual(["V7 undo.method", "V11 undo.method"]);
  });

  it("accepts a valid R1 and rejects one that modifies existing data", () => {
    expect(problemsOf(base.r1())).toEqual([]);
    const record = base.r1();
    record.flags = { ...record.flags, modifies_existing: true };
    expect(problemsOf(record)).toEqual(["V7 flags.modifies_existing"]);
  });

  it("skips what a draft leaves out", () => {
    expect(v7Class({ class: "R0" })).toEqual([]);
  });
});
