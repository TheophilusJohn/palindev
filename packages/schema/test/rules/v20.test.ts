import { describe, expect, it } from "vitest";
import { CLASS_RULES } from "../../src/rules/v20.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V20: variants pass the class rules and are no stricter than the top level", () => {
  fixtureTests("V20", ["tags.update.yaml V20 variants[0].class", "tags.update.yaml V20 variants[0].recommended_policy"]);

  it("reruns V7 to V14", () => {
    expect(CLASS_RULES.map(([rule]) => rule)).toEqual(["V7", "V8", "V9", "V10", "V11", "V12", "V13", "V14"]);
  });

  it("accepts a weaker variant that sets what its class needs", () => {
    const record = base.r3();
    record.variants = [
      { when: { args: { send_email: false } }, class: "R2", flags: { reaches_third_parties: false }, residue: [], recommended_policy: "allow_and_log", approval_text: null },
    ];
    expect(problemsOf(record)).toEqual([]);
  });

  it("reports what a weaker variant inherits but its class forbids", () => {
    const record = base.r3();
    record.variants = [{ when: { args: { send_email: false } }, class: "R2", recommended_policy: "allow_and_log", approval_text: null }];
    expect(problemsOf(record)).toEqual(["V20 variants[0].residue[0].audience", "V20 variants[0].recommended_policy"]);
  });

  it("doesn't repeat a top-level problem in a value the variant inherits", () => {
    const record = base.r3();
    record.suggested_annotations = { ...record.suggested_annotations, openWorldHint: false };
    record.variants = [{ when: { plan: "free" }, residue: [{ kind: "email", audience: "external", note: "Still emailed.", observed_by: "doc" }] }];
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.openWorldHint"]);
  });

  it("treats a variant's annotations key by key when deciding what it inherits", () => {
    const record = base.r3();
    record.suggested_annotations = { ...record.suggested_annotations, openWorldHint: false };
    record.variants = [{ when: { plan: "free" }, suggested_annotations: { readOnlyHint: false } }];
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.openWorldHint"]);
  });

  it("reports a problem the variant itself sets, even if the top level has it too", () => {
    const record = base.r3();
    record.suggested_annotations = { ...record.suggested_annotations, openWorldHint: false };
    record.variants = [{ when: { plan: "free" }, suggested_annotations: { openWorldHint: false } }];
    expect(problemsOf(record)).toEqual(["V13 suggested_annotations.openWorldHint", "V20 variants[0].suggested_annotations.openWorldHint"]);
  });

  it("replaces undo wholesale, so a variant's undo must fit the variant's class", () => {
    const record = base.r3();
    record.variants = [
      {
        when: { args: { void_after: 0 } },
        class: "R5",
        undo: { method: "inverse_call", operation: null, steps: [], window: null, window_condition: null, compensating_action: null, capture: [] },
        recommended_policy: "confirm_strong",
        approval_text: "Emails the customer and can't be voided.",
      },
    ];
    expect(problemsOf(record)).toEqual([
      "V20 variants[0].undo.method",
      "V20 variants[0].undo.operation",
      "V20 variants[0].class",
      "V20 variants[0].recommended_policy",
    ]);
  });
});
