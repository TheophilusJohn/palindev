import { describe, expect, it } from "vitest";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V4: documented and community need matching evidence", () => {
  fixtureTests("V4", ["invoices.get.yaml V4 evidence"]);

  it("accepts a documented record backed only by a vendor statement", () => {
    const record = base.r0();
    record.evidence = [{ type: "vendor_statement", url: "https://docs.acme.example/changelog#2026-09", date: "2026-09-12" }];
    expect(problemsOf(record)).toEqual([]);
  });

  it("rejects a community record without a community item", () => {
    const record = base.r0();
    record.confidence = "community";
    expect(problemsOf(record)).toEqual(["V4 evidence"]);
  });

  it("accepts a community record with a community item", () => {
    const record = base.r0();
    record.confidence = "community";
    record.evidence = [
      { type: "community", url: "https://forum.acme.example/t/12", date: "2026-09-20", summary: "A user reports the call changes nothing." },
    ];
    expect(problemsOf(record)).toEqual([]);
  });
});
