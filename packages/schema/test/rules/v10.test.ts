import { describe, expect, it } from "vitest";
import { v10Class } from "../../src/rules/v10.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V10: only R4 has an undo window", () => {
  fixtureTests("V10", ["tags.update.yaml V10 undo.window"]);

  it("accepts an R4 with a window, or with only a window condition", () => {
    expect(problemsOf(base.r4())).toEqual([]);
    const record = base.r4();
    record.undo = { ...record.undo, window: null, window_condition: "until the draft is emptied from the trash" };
    expect(problemsOf(record)).toEqual([]);
  });

  it("rejects an R4 with neither", () => {
    const record = base.r4();
    record.undo = { ...record.undo, window: null };
    expect(problemsOf(record)).toEqual(["V10 undo.window"]);
  });

  it("rejects a window condition below R4", () => {
    const record = base.r2();
    record.undo = { ...record.undo, window_condition: "until the tag is deleted" };
    expect(problemsOf(record)).toEqual(["V10 undo.window_condition"]);
  });

  it("skips an R4 draft that hasn't said yet", () => {
    expect(v10Class({ class: "R4", undo: { method: "restore", window: null } })).toEqual([]);
  });
});
