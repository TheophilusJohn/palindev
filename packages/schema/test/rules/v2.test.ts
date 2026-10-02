import { afterAll, describe, expect, it } from "vitest";
import { v2 } from "../../src/rules/v2.js";
import { baseText, brief, check, fixtureTests, removeTempRoots, tempRoot } from "../helpers.js";

afterAll(removeTempRoots);

describe("V2: every provider directory has a valid _provider.yaml", () => {
  fixtureTests("V2", ["invoices.get.yaml V2 provider"]);

  it("passes when the provider file exists and is valid", () => {
    expect(v2({ exists: true, valid: true })).toEqual([]);
  });

  it("explains a missing provider file", () => {
    expect(v2({ exists: false, valid: false })[0]?.message).toMatch(/no _provider.yaml/);
  });

  it("fails every record of a provider whose file doesn't pass the provider schema", () => {
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace("  status: green\n", "  status: amber\n"),
      "acme/invoices.get.yaml": baseText("r0"),
    });
    expect(brief(check(root))).toEqual(["_provider.yaml schema terms.status", "invoices.get.yaml V2 provider"]);
  });

  it("fails a record next to a provider file that doesn't parse", () => {
    const root = tempRoot({ "acme/_provider.yaml": "id: [acme\n", "acme/invoices.get.yaml": baseText("r0") });
    const problems = brief(check(root));
    expect(problems).toContain("invoices.get.yaml V2 provider");
    expect(problems.filter((line) => line.startsWith("_provider.yaml")).every((line) => line.includes(" yaml "))).toBe(true);
  });

  it("still checks the directory when a record itself doesn't parse", () => {
    const root = tempRoot({ "acme/invoices.get.yaml": "id: [broken\n" });
    const rules = brief(check(root)).map((line) => line.split(" ")[1]);
    expect(rules).toContain("V2");
    expect(rules.filter((rule) => rule !== "V2").every((rule) => rule === "yaml")).toBe(true);
  });
});
