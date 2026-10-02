import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixText } from "../src/fix.js";
import { main } from "../src/main.js";
import { NOW, VALID_ROOT, baseText, check, invalidRoot, removeTempRoots, tempRoot } from "./helpers.js";

const copies: string[] = [];
afterAll(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
  removeTempRoots();
});

function copyRoot(root: string): string {
  const dir = mkdtempSync(join(tmpdir(), "palin-schema-fix-"));
  copies.push(dir);
  const copy = join(dir, "data");
  cpSync(root, copy, { recursive: true });
  return copy;
}

function fix(root: string, files: string[] = []): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const code = main(["--fix", ...(files.length === 0 ? ["--root", root] : files)], {
    cwd: root,
    now: NOW,
    probeMailDomain: undefined,
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
  });
  return { code, out, err };
}

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(join(root, "acme"))) files[name] = readFileSync(join(root, "acme", name), "utf8");
  return files;
}

// Legal YAML whose meaning depends on key order: needs_admin_scope is true here.
const REUSED_ANCHORS = "flags: {bulk: &v false, modifies_existing: *v, moves_money: &v true, needs_admin_scope: *v}\n";

describe("pnpm validate --fix", () => {
  it("fixes the V18 root's order and quoting, after which it validates clean", () => {
    const root = copyRoot(invalidRoot("V18"));
    expect(check(root).length).toBe(8);
    const { code, out } = fix(root);
    expect(code).toBe(0);
    expect(out).toContain("fixed acme/invoices.get.yaml");
    expect(check(root)).toEqual([]);

    const record = readFileSync(join(root, "acme", "invoices.get.yaml"), "utf8");
    expect(record.startsWith('id: acme.invoices.get\nprovider: acme\ntitle: "Get an invoice"\n')).toBe(true);
    expect(record).toContain('api_version: "2026-09-01"\n');
    expect(record).toContain("undo:\n  method: not_applicable\n  # nothing to undo for a read\n  operation: null\n");
    expect(record).toContain("  - type: doc\n    url: https://docs.acme.example/api/invoices/get\n");
    expect(record).toMatch(/retrieved: 2026-09-28\n {4}supports: \[summary\]\n/);

    const tested = readFileSync(join(root, "acme", "tags.update.yaml"), "utf8");
    expect(tested).toContain('  idempotent: "no"\n');
    expect(tested).toMatch(/trace_sha256: "0123456789abcdef/);
    expect(tested).toContain('beta: "On"');

    expect(readFileSync(join(root, "acme", "_provider.yaml"), "utf8")).toContain('current_api_version: "2026-09-01"\n');
  });

  it("is a no-op on the second run", () => {
    const root = copyRoot(invalidRoot("V18"));
    fix(root);
    const before = snapshot(root);
    expect(fix(root).out).not.toContain("fixed");
    expect(snapshot(root)).toEqual(before);
  });

  it("never rewrites files without V18 warnings", () => {
    const root = copyRoot(VALID_ROOT);
    const before = snapshot(root);
    expect(fix(root).code).toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("rewrites only the named files", () => {
    const root = copyRoot(invalidRoot("V18"));
    const before = snapshot(root);
    expect(fix(root, [join(root, "acme", "invoices.get.yaml")]).out).toContain("fixed acme/invoices.get.yaml");
    const after = snapshot(root);
    expect(after["invoices.get.yaml"]).not.toBe(before["invoices.get.yaml"]);
    expect(after["tags.update.yaml"]).toBe(before["tags.update.yaml"]);
    expect(after["_provider.yaml"]).toBe(before["_provider.yaml"]);
  });

  it("refuses a rewrite that would change the data, and leaves the file alone", () => {
    expect(() => fixText(REUSED_ANCHORS, "record")).toThrow(/would change this file's data/);
    const text = baseText("r2").replace(
      /flags:\n(?: {2}.+\n)+/,
      "flags: {bulk: &v false, modifies_existing: *v, moves_money: &v true, needs_admin_scope: *v, reaches_third_parties: false, changes_permissions: false, idempotent: natural}\n",
    );
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/tags.update.yaml": text });
    const result = fix(root);
    expect(readFileSync(join(root, "acme", "tags.update.yaml"), "utf8")).toBe(text);
    expect(result.out).not.toContain("fixed");
    expect(result.err).toMatch(/tags\.update\.yaml: not fixed: reordering would change this file's data/);
  });

  it("refuses, with a clear message, when reordering puts an alias before its anchor", () => {
    expect(() => fixText("flags: {needs_admin_scope: &t true, modifies_existing: *t}\n", "record")).toThrow(/^not fixed: /);
  });

  it("keeps a comment on the nested key it was written above", () => {
    const text = "id: x\nflags:\n  # explains bulk\n  bulk: false\n  moves_money: false\n";
    expect(fixText(text, "record")).toEqual({ text: "id: x\nflags:\n  moves_money: false\n  # explains bulk\n  bulk: false\n", changed: true });
  });

  it("keeps a file header at the top when the first key moves", () => {
    const { text } = fixText("# Acme: get one invoice\ntitle: t\nid: x\n", "record");
    expect(text.startsWith("# Acme: get one invoice\nid: x\n")).toBe(true);
  });

  it("doesn't move a comment written above a list item into the item", () => {
    const text = "residue:\n  - kind: email\n    audience: external\n    note: n\n  # only with an address\n  - audience: actor\n    kind: webhook\n    note: m\n";
    const { text: fixed } = fixText(text, "record");
    expect(fixed).toContain("  # only with an address\n  - kind: webhook\n    audience: actor\n");
  });

  it("leaves a file it can't parse alone", () => {
    expect(fixText("id: [x\n", "record")).toEqual({ text: "id: [x\n", changed: false });
  });
});
