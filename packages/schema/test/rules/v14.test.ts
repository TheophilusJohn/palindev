import { describe, expect, it } from "vitest";
import { minimumPolicy } from "../../src/rules/v14.js";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V14: the policy is at least the class and flags minimum", () => {
  fixtureTests("V14", ["invoices.send.yaml V14 recommended_policy"]);

  it("starts from the class minimum", () => {
    expect(minimumPolicy({ class: "R0" }).policy).toBe("allow");
    expect(minimumPolicy({ class: "R1" }).policy).toBe("allow_and_log");
    expect(minimumPolicy({ class: "R2" }).policy).toBe("allow_and_log");
    expect(minimumPolicy({ class: "R3" }).policy).toBe("confirm");
    expect(minimumPolicy({ class: "R4" }).policy).toBe("confirm");
    expect(minimumPolicy({ class: "R5" }).policy).toBe("confirm_strong");
  });

  it.each(["moves_money", "changes_permissions", "reaches_third_parties"] as const)("raises R2 to confirm when %s", (flag) => {
    const record = base.r2();
    record.flags = { ...record.flags, [flag]: true };
    expect(problemsOf(record)).toEqual(["V14 recommended_policy"]);
    record.recommended_policy = "confirm";
    expect(problemsOf(record)).toEqual([]);
  });

  it("raises bulk one step above the otherwise minimum", () => {
    expect(minimumPolicy({ class: "R2", flags: { bulk: true } }).policy).toBe("confirm");
    expect(minimumPolicy({ class: "R2", flags: { bulk: true, moves_money: true } }).policy).toBe("confirm_strong");
    const record = base.r2();
    record.flags = { ...record.flags, bulk: true };
    expect(problemsOf(record)).toEqual(["V14 recommended_policy"]);
  });

  it("caps bulk at confirm_strong: block is never computed", () => {
    expect(minimumPolicy({ class: "R5", flags: { bulk: true } }).policy).toBe("confirm_strong");
    const record = base.r5();
    record.flags = { ...record.flags, bulk: true };
    expect(problemsOf(record)).toEqual([]);
  });

  it("accepts a stricter policy, up to block", () => {
    const record = base.r0();
    record.recommended_policy = "block";
    expect(problemsOf(record)).toEqual([]);
  });
});
