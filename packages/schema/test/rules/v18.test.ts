import { describe, expect, it } from "vitest";
import { parseYaml } from "../../src/load.js";
import { v18 } from "../../src/rules/v18.js";
import { VALID_ROOT, baseText, check, fixtureTests, invalidRoot } from "../helpers.js";

describe("V18 (warning): documented key order and quoting", () => {
  fixtureTests("V18", [
    "_provider.yaml V18 current_api_version",
    "invoices.get.yaml V18 provider",
    "invoices.get.yaml V18 api_version",
    "invoices.get.yaml V18 undo.method",
    "invoices.get.yaml V18 evidence[0].url",
    "tags.update.yaml V18 flags.idempotent",
    "tags.update.yaml V18 evidence[1].trace_sha256",
    "tags.update.yaml V18 evidence[1].tested_on.settings.beta",
  ]);

  it("reports only warnings, so the V18 root still passes", () => {
    const problems = check(invalidRoot("V18"));
    expect(problems.every((problem) => problem.severity === "warning")).toBe(true);
    expect(check(VALID_ROOT)).toEqual([]);
  });

  it("finds nothing in the bases", () => {
    for (const name of ["r0", "r1", "r2", "r3", "r4", "r5"] as const) {
      expect(v18(parseYaml(baseText(name)).doc, "record")).toEqual([]);
    }
    expect(v18(parseYaml(baseText("provider")).doc, "provider")).toEqual([]);
  });

  it("orders variant, capture and consent keys too", () => {
    const record = parseYaml(`variants:
  - class: R2
    when: { plan: free }
undo:
  capture:
    - field: tag.name
      before: { method: GET, kind: http, path: "/v1/tags/{tag}" }
`).doc;
    expect(v18(record, "record").map((issue) => issue.path)).toEqual([
      "undo",
      "variants[0].when",
      "undo.capture[0].before",
      "undo.capture[0].before.kind",
    ]);
    const provider = parseYaml(`terms:\n  consent: { from: Legal, date: 2026-09-01, reference: email }\n`).doc;
    expect(v18(provider, "provider").map((issue) => issue.path)).toEqual(["terms.consent.date"]);
  });

  it("orders service between kind and method, and quotes a variant's idempotent no", () => {
    const doc = parseYaml(`operation: { kind: http, method: GET, service: s3, path: /x }
variants:
  - when: { plan: free }
    flags: { idempotent: no }
`).doc;
    expect(v18(doc, "record").map((issue) => issue.path)).toEqual(["operation.service", "variants[0].flags.idempotent"]);
  });

  it("asks for yes, no, on and off settings in any case to be quoted, but not other values", () => {
    const doc = parseYaml(`variants:
  - when:
      settings: { a: Yes, b: "no", c: OFF, d: [y, N], e: true, f: disabled }
`).doc;
    expect(v18(doc, "record").map((issue) => issue.path)).toEqual([
      "variants[0].when.settings.a",
      "variants[0].when.settings.c",
      "variants[0].when.settings.d[0]",
      "variants[0].when.settings.d[1]",
    ]);
  });
});
