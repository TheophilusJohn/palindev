import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RULE_IDS } from "../src/problems.js";
import { FIXTURES } from "./helpers.js";

const TESTS = fileURLToPath(new URL("./rules/", import.meta.url));

describe("rule coverage", () => {
  it.each(RULE_IDS)("%s has an invalid fixture root and its own test file", (rule) => {
    expect(existsSync(join(FIXTURES, "invalid", rule, "data")), `test/fixtures/invalid/${rule}/data`).toBe(true);
    expect(existsSync(join(TESTS, `${rule.toLowerCase()}.test.ts`)), `test/rules/${rule.toLowerCase()}.test.ts`).toBe(true);
  });

  it("has no invalid root for a rule that doesn't exist", () => {
    const roots = readdirSync(join(FIXTURES, "invalid"));
    expect(roots.filter((root) => !(RULE_IDS as readonly string[]).includes(root) && root !== "schema" && root !== "yaml")).toEqual([]);
  });

  it("leaves V23 to week 2 (it needs the network)", () => {
    expect(RULE_IDS as readonly string[]).not.toContain("V23");
  });
});
