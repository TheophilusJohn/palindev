import { describe, expect, it } from "vitest";
import { classView, mergeVariant } from "../src/rules/class-view.js";
import { classRank, hasOwn, isDraft, needsApprovalText, policyRank } from "../src/rules/context.js";
import { base } from "./helpers.js";

describe("classView and mergeVariant", () => {
  it("picks the fields the class rules read", () => {
    const record = base.r3();
    expect(Object.keys(classView(record))).toEqual(["class", "flags", "undo", "residue", "suggested_annotations", "recommended_policy"]);
  });

  it("merges flags and annotations key by key and replaces residue and undo", () => {
    const record = base.r3();
    const merged = mergeVariant(record, {
      when: { plan: "free" },
      class: "R2",
      flags: { reaches_third_parties: false },
      suggested_annotations: { destructiveHint: false },
      residue: [],
    });
    expect(merged.class).toBe("R2");
    expect(merged.flags).toEqual({ ...record.flags, reaches_third_parties: false });
    expect(merged.suggested_annotations).toEqual({ ...record.suggested_annotations, destructiveHint: false });
    expect(merged.residue).toEqual([]);
    expect(merged.undo).toBe(record.undo);
    expect(merged.recommended_policy).toBe("confirm");
  });
});

describe("rule context helpers", () => {
  it("rank classes and policies from least to most strict", () => {
    expect(classRank("R0")).toBeLessThan(classRank("R5"));
    expect(policyRank("allow")).toBeLessThan(policyRank("block"));
    expect(["R2", "R3", "R5"].map((cls) => needsApprovalText(cls as "R2"))).toEqual([false, true, true]);
  });

  it("recognise drafts and own keys", () => {
    const record = base.r0();
    expect(isDraft(record)).toBe(false);
    expect(hasOwn({ a: undefined }, "a")).toBe(true);
    expect(hasOwn({}, "toString")).toBe(false);
  });
});
