import { describe, expect, it } from "vitest";
import { v6 } from "../../src/rules/v6.js";
import { NOW, base, fixtureTests, problemsOf } from "../helpers.js";

describe("V6: last_verified", () => {
  fixtureTests("V6", ["invoices.get.yaml V6 last_verified"]);

  it("is required unless the record is a draft", () => {
    const record = base.r0();
    delete record.last_verified;
    expect(problemsOf(record)).toEqual(["V6 last_verified"]);
  });

  it("is forbidden on drafts", () => {
    const record = base.r0();
    record.confidence = "draft";
    expect(problemsOf(record)).toEqual(["V6 last_verified"]);
  });

  it("may be today but not later, using the injected date", () => {
    const record = base.r0();
    record.last_verified = NOW;
    expect(problemsOf(record)).toEqual([]);
    expect(v6(record, { now: "2026-09-30" })).toEqual([{ path: "last_verified", message: "is after today (2026-09-30)" }]);
  });

  it("leaves a malformed date to V15", () => {
    const record = base.r0();
    record.last_verified = "2099-13-01";
    expect(problemsOf(record)).toEqual(["V15 last_verified"]);
  });
});
