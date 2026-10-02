import { afterAll, describe, expect, it } from "vitest";
import { v1Provider, v1Record } from "../../src/rules/v1.js";
import { baseText, brief, check, fixtureTests, removeTempRoots, tempRoot } from "../helpers.js";

afterAll(removeTempRoots);

describe("V1: ids match file paths", () => {
  fixtureTests("V1", ["invoices.get.yaml V1 id"]);

  it("accepts a record whose id and provider match its path", () => {
    expect(v1Record({ id: "acme.invoices.get", provider: "acme" }, "acme", "invoices.get")).toEqual([]);
  });

  it("rejects a provider that isn't the directory", () => {
    expect(v1Record({ id: "acme.invoices.get", provider: "other" }, "acme", "invoices.get")).toEqual([
      { path: "provider", message: "must be acme, the record's directory" },
    ]);
  });

  it("leaves a missing or non-string id to the schema", () => {
    expect(v1Record({ provider: "acme" }, "acme", "invoices.get")).toEqual([]);
    expect(v1Record({ id: 7 }, "acme", "invoices.get")).toEqual([]);
  });

  it("checks a provider file's id against its directory", () => {
    expect(v1Provider({ id: "acme" }, "acme")).toEqual([]);
    expect(v1Provider({ id: "acme_billing" }, "acme")).toEqual([{ path: "id", message: "must be acme, the provider's directory" }]);
  });

  it("reports a _provider.yaml whose id isn't its directory", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider").replace("id: acme\n", "id: other\n") });
    expect(brief(check(root))).toEqual(["_provider.yaml V1 id"]);
  });

  it("reports files outside the layout, and allows LICENSE, README.md and dotfiles", () => {
    const root = tempRoot({
      LICENSE: "license text",
      "README.md": "about this data",
      ".DS_Store": "x",
      "notes.txt": "stray",
      "stray.yaml": "id: stray",
      "acme/_provider.yaml": baseText("provider"),
      "acme/invoices.get.yml": baseText("r0"),
      "acme/drafts/invoices.get.yaml": baseText("r0"),
      "acme/notes.md": "stray",
      "acme/.keep": "",
    });
    expect(brief(check(root)).filter((line) => line.includes(" V1 "))).toEqual([
      "invoices.get.yaml V1 (file)",
      "invoices.get.yml V1 (file)",
      "notes.md V1 (file)",
      "notes.txt V1 (file)",
      "stray.yaml V1 (file)",
    ]);
  });
});
