import { describe, expect, it } from "vitest";
import { expectedAnnotations } from "../../src/rules/v13.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V13: suggested annotations follow the mapping", () => {
  fixtureTests("V13", ["tags.update.yaml V13 suggested_annotations.destructiveHint"]);

  it("follows the mapping table for each class", () => {
    const values = (cls: "R0" | "R1" | "R2" | "R3", modifies: boolean) =>
      Object.values(expectedAnnotations({ class: cls, flags: { modifies_existing: modifies, idempotent: "natural" } })).map(
        (hint) => hint?.value,
      );
    expect(values("R0", false)).toEqual([true, false, true, true]);
    expect(values("R1", false)).toEqual([false, false, true, true]);
    expect(values("R2", false)).toEqual([false, false, true, true]);
    expect(values("R2", true)).toEqual([false, true, true, true]);
    expect(values("R3", false)).toEqual([false, true, true, true]);
  });

  it("rejects readOnlyHint false on R0", () => {
    const record = base.r0();
    record.suggested_annotations = { ...record.suggested_annotations, readOnlyHint: false };
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.readOnlyHint"]);
  });

  it("rejects destructiveHint false on R3 to R5, even when nothing existing changes", () => {
    const record = base.r5();
    record.suggested_annotations = { ...record.suggested_annotations, destructiveHint: false };
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.destructiveHint"]);
  });

  it("sets idempotentHint only for natural idempotency", () => {
    const record = base.r5(); // idempotent: key
    record.suggested_annotations = { ...record.suggested_annotations, idempotentHint: true };
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.idempotentHint"]);
  });

  it("rejects openWorldHint false", () => {
    const record = base.r2();
    record.suggested_annotations = { ...record.suggested_annotations, openWorldHint: false };
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.openWorldHint"]);
  });

  it("skips destructiveHint on an R2 draft that hasn't said whether it modifies existing data", () => {
    const record = base.r2();
    record.confidence = "draft";
    delete record.last_verified;
    const { modifies_existing: _, ...flags } = record.flags ?? {};
    record.flags = flags;
    record.suggested_annotations = { ...record.suggested_annotations, destructiveHint: false };
    record.evidence.push({ type: "todo", field: "flags.modifies_existing", note: "Find whether it edits the tag in place." });
    expect(problemsOf(record)).toEqual([]);
  });
});
