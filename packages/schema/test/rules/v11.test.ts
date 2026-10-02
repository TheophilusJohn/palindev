import { describe, expect, it } from "vitest";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V11: the undo method fits the class", () => {
  fixtureTests("V11", ["tags.update.yaml V11 undo.method"]);

  it("rejects not_applicable on R1", () => {
    const record = base.r1();
    record.undo = { ...record.undo, method: "not_applicable" };
    expect(problemsOf(record)).toEqual(["V11 undo.method"]);
  });

  it("accepts restore on R2 and R4", () => {
    const record = base.r2();
    record.undo = { ...record.undo, method: "restore" };
    expect(problemsOf(record)).toEqual([]);
    expect(problemsOf(base.r4())).toEqual([]);
  });

  it("rejects a compensating action on R3", () => {
    const record = base.r3();
    record.undo = { ...record.undo, method: "compensating_action", compensating_action: "Send a correction." };
    expect(problemsOf(record)).toEqual(["V11 undo.method"]);
  });

  it("rejects an inverse call on R5 and accepts none", () => {
    const record = base.r5();
    record.undo = { ...record.undo, method: "inverse_call", compensating_action: null };
    expect(problemsOf(record)).toEqual(["V11 undo.method"]);
    record.undo = { ...record.undo, method: "none", operation: null };
    expect(problemsOf(record)).toEqual([]);
  });
});
