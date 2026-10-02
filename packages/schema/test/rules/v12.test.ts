import { describe, expect, it } from "vitest";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V12: the undo has what its method needs", () => {
  fixtureTests("V12", ["charges.create.yaml V12 undo.compensating_action"]);

  it("rejects an inverse call with neither an operation nor steps", () => {
    const record = base.r2();
    record.undo = { ...record.undo, operation: null };
    expect(problemsOf(record)).toEqual(["V12 undo.operation"]);
  });

  it("accepts a UI-only undo described in steps", () => {
    const record = base.r2();
    record.undo = { ...record.undo, method: "restore", operation: null, steps: ["Open Tags, choose the tag, set its old name and color."] };
    expect(problemsOf(record)).toEqual([]);
  });

  it("rejects an operation when the method is none", () => {
    const record = base.r5();
    record.undo = { ...record.undo, method: "none", compensating_action: null };
    expect(problemsOf(record)).toEqual(["V12 undo.operation"]);
  });

  it("skips a draft whose undo steps aren't known yet", () => {
    const record = base.r2();
    record.confidence = "draft";
    delete record.last_verified;
    record.undo = { method: "inverse_call", operation: null, window: null, window_condition: null, compensating_action: null, capture: [] };
    record.evidence.push({ type: "todo", field: "undo.steps", note: "Find whether the undo is UI only." });
    expect(problemsOf(record)).toEqual([]);
  });
});
