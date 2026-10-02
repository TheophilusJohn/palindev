import { describe, expect, it } from "vitest";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V9: R3 has residue that escapes or is lost", () => {
  fixtureTests("V9", ["invoices.send.yaml V9 residue"]);

  it.each([
    ["workspace", "notification"],
    ["external", "email"],
    ["actor", "fee_retained"],
    ["vendor", "lost_state"],
  ] as const)("accepts %s %s residue", (audience, kind) => {
    const record = base.r3();
    record.residue = [{ kind, audience, note: "Something escapes or is lost.", observed_by: "doc" }];
    expect(problemsOf(record)).toEqual([]);
  });

  it("rejects an R3 with no residue at all", () => {
    const record = base.r3();
    record.residue = [];
    expect(problemsOf(record)).toEqual(["V9 residue"]);
  });
});
