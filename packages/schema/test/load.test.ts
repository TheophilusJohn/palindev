import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ROOT_FILES, loadDataRoot, parseYaml } from "../src/load.js";
import { VALID_ROOT, baseText, removeTempRoots, tempRoot } from "./helpers.js";

afterAll(removeTempRoots);

describe("parseYaml", () => {
  it("reads YAML 1.2 core: unquoted dates and no stay strings", () => {
    expect(parseYaml("retrieved: 2026-09-28\nidempotent: no\nflag: true\n").data).toEqual({
      retrieved: "2026-09-28",
      idempotent: "no",
      flag: true,
    });
  });

  it("reports duplicate keys and syntax errors with their line, and no data", () => {
    const duplicate = parseYaml("id: a\nid: b\n");
    expect(duplicate.errors).toHaveLength(1);
    expect(duplicate.errors[0]?.line).toBe(2);
    expect(duplicate.data).toBeUndefined();
    expect(parseYaml("operation:\n  kind: http\n path: /x\n").errors.map((error) => error.line)).toEqual([3]);
  });

  it("returns null data for an empty file", () => {
    expect(parseYaml("").data).toBeNull();
  });

  it.each([
    ["!!omap", "settings: !!omap\n  - a: 1\n"],
    ["!!set", "settings: !!set\n  ? a\n"],
    ["!!binary", "notes: !!binary aGVsbG8=\n"],
    ["!!timestamp", "id: x\nlast_verified: !!timestamp 2026-09-28\n"],
  ])("rejects %s, whose value isn't a plain mapping, list or scalar", (tag, text) => {
    const parsed = parseYaml(text);
    expect(parsed.data).toBeUndefined();
    expect(parsed.errors.map((error) => error.message)).toEqual([`${tag} isn't allowed: a record holds only plain mappings, lists and scalars`]);
    expect(parsed.errors[0]?.line).toBe(text.split("\n").findIndex((line) => line.includes(tag)) + 1);
  });
});

describe("loadDataRoot", () => {
  it("loads provider files and records by provider directory", () => {
    const root = loadDataRoot(VALID_ROOT);
    expect([...root.providers.keys()]).toEqual(["acme"]);
    expect(root.records.map((record) => record.stem)).toEqual(["customers.delete", "invoices.get", "invoices.send", "tags.update"]);
    expect(root.records.every((record) => record.kind === "record" && record.providerDir === "acme")).toBe(true);
    expect(root.misplaced).toEqual([]);
    expect(root.files.map((file) => file.slice(VALID_ROOT.length + 1))).toContain("LICENSE");
  });

  it("allows LICENSE and README.md in the root", () => {
    expect([...ROOT_FILES].sort()).toEqual(["LICENSE", "README.md"]);
  });

  it("reports symlinks, wherever they are, without following them", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/sub/keep.txt": "x" });
    symlinkSync(join(VALID_ROOT, "acme", "invoices.get.yaml"), join(root, "acme", "invoices.get.yaml"));
    symlinkSync(join(VALID_ROOT, "acme"), join(root, "beta"));
    symlinkSync(join(VALID_ROOT, "LICENSE"), join(root, "acme", "sub", "LICENSE"));
    const loaded = loadDataRoot(root);
    expect(loaded.records).toEqual([]);
    const links = loaded.misplaced.filter((entry) => entry.message.startsWith("symlinks"));
    expect(links.map((entry) => entry.file.slice(root.length + 1)).sort()).toEqual(["acme/invoices.get.yaml", "acme/sub/LICENSE", "beta"]);
    expect(loaded.files.some((file) => file.endsWith("invoices.get.yaml"))).toBe(false);
  });

  it("reports misplaced files and keeps dotfiles for V16 only", () => {
    const root = tempRoot({
      ".hidden": "x",
      "acme/_provider.yml": baseText("provider"),
      "acme/invoices.get.yml": baseText("r0"),
    });
    const loaded = loadDataRoot(root);
    expect(loaded.providers.size).toBe(0);
    expect(loaded.records.map((record) => record.stem)).toEqual(["invoices.get"]);
    expect(loaded.misplaced.map((entry) => entry.message)).toEqual(["name the provider file _provider.yaml", "record files end in .yaml"]);
    expect(loaded.files).toContain(join(root, ".hidden"));
  });
});
