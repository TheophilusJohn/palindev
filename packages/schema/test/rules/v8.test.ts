import { describe, expect, it } from "vitest";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V8: R2 residue stays with the actor or the vendor", () => {
  fixtureTests("V8", ["tags.update.yaml V8 residue[0].audience"]);

  it("accepts actor and vendor residue", () => {
    const record = base.r2();
    record.residue = [
      { kind: "webhook", audience: "actor", note: "An event goes to the account's own endpoints.", observed_by: "doc" },
      { kind: "audit_log", audience: "vendor", note: "The change is logged.", observed_by: "doc" },
    ];
    expect(problemsOf(record)).toEqual([]);
  });

  it.each(["fee_retained", "lost_state"] as const)("rejects %s residue even for the actor", (kind) => {
    const record = base.r2();
    record.residue = [{ kind, audience: "actor", note: "Something the undo can't take back.", observed_by: "doc" }];
    expect(problemsOf(record)).toEqual(["V8 residue[0].kind"]);
  });

  it("rejects external residue", () => {
    const record = base.r2();
    record.residue = [{ kind: "email", audience: "external", note: "A customer is emailed.", observed_by: "doc" }];
    expect(problemsOf(record)).toEqual(["V8 residue[0].audience"]);
  });
});
