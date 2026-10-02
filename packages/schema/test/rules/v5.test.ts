import { describe, expect, it } from "vitest";
import { base, fixtureTests, problemsOf } from "../helpers.js";

describe("V5: todo evidence only on drafts", () => {
  fixtureTests("V5", ["invoices.get.yaml V5 evidence[1]"]);

  it("allows todo items on a draft", () => {
    const record = base.r0();
    record.confidence = "draft";
    delete record.last_verified;
    record.evidence.push({ type: "todo", field: "summary", note: "Confirm the wording." });
    expect(problemsOf(record)).toEqual([]);
  });

  it("rejects todo items on community and tested records too", () => {
    const record = base.r0();
    record.confidence = "community";
    record.evidence = [
      { type: "community", url: "https://forum.acme.example/t/12", date: "2026-09-20", summary: "A report." },
      { type: "todo", field: "summary", note: "Confirm the wording." },
    ];
    expect(problemsOf(record)).toEqual(["V5 evidence[1]"]);
    const tested = base.r0();
    tested.confidence = "tested";
    tested.evidence.push({ type: "todo", field: "summary", note: "Confirm the wording." });
    expect(problemsOf(tested)).toContain("V5 evidence[1]");
  });
});
