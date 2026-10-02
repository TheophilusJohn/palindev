import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RECORD_RULES, validateRecord, validateRepo } from "../src/validate.js";
import { NOW, VALID_ROOT, base, baseText, brief, check, invalidRoot, removeTempRoots, tempRoot } from "./helpers.js";

afterAll(removeTempRoots);

describe("validateRepo", () => {
  it("counts the records and provider files it loaded, and lists the files it looked at", () => {
    const result = validateRepo({ root: invalidRoot("V17"), now: NOW, probeMailDomain: undefined });
    expect([result.records, result.providers, result.files.length]).toEqual([2, 1, 3]);
  });

  it("reports only the named files, while checking them against every record", () => {
    const root = invalidRoot("V17");
    expect(brief(check(root, { files: [`${root}/acme/invoices.get.yaml`] }))).toEqual(["invoices.get.yaml V17 operation"]);
  });

  it("matches named files by identity, whatever the case of the path", () => {
    const root = invalidRoot("V13");
    const upper = join(root, "ACME", "TAGS.UPDATE.YAML");
    if (!existsSync(upper)) return; // case-sensitive file system: nothing to test
    expect(brief(check(root, { files: [upper] }))).toEqual(["tags.update.yaml V13 suggested_annotations.destructiveHint"]);
  });

  it("reports a provider directory's records when its _provider.yaml is named", () => {
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace("  status: green\n", "  status: red\n"),
      "acme/tags.update.yaml": baseText("r2").replace("confidence: documented\n", "confidence: tested\n"),
    });
    const problems = brief(check(root, { files: [join(root, "acme", "_provider.yaml")] }));
    expect(problems).toContain("tags.update.yaml V3 confidence");
    expect(problems).toContain("tags.update.yaml V24 confidence");
  });

  it("reports the provider file's own problems when a named record fails V2 because of it", () => {
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace("  cost: free\n", "  cost: cheap\n"),
      "acme/invoices.get.yaml": baseText("r0"),
    });
    expect(brief(check(root, { files: [join(root, "acme", "invoices.get.yaml")] }))).toEqual([
      "_provider.yaml schema sandbox.cost",
      "invoices.get.yaml V2 provider",
    ]);
  });

  it("gives each problem a line and column from its path", () => {
    const [problem] = check(invalidRoot("V13"));
    expect([problem?.line, problem?.col]).toEqual([33, 3]);
  });

  it("skips the semantic rules on a file that fails the schema, so nothing cascades", () => {
    expect(brief(check(invalidRoot("schema")))).toEqual(["invoices.get.yaml schema class"]);
  });

  it("gives a file with YAML errors yaml problems plus the checks that don't need its content", () => {
    const problems = check(invalidRoot("yaml"));
    expect(brief(problems)).toEqual(["invoices.get.yaml yaml (file)"]);
    expect(problems[0]?.line).toBe(8);
  });

  it("still runs V1, V16 and V18 on files that fail the schema, and V16 on files that don't parse", () => {
    const record = baseText("r0")
      .replace("class: R0\n", "class: R6\n")
      .replace("id: acme.invoices.get\nprovider: acme\n", "provider: acme\nid: acme.invoices.fetch\n")
      .replace("last_verified: 2026-09-28\n", "last_verified: 2026-09-28\nnotes: owner@mail.acme.io\n");
    const provider = baseText("provider")
      .replace("id: acme\nname: Acme Billing\n", "name: Acme Billing\nid: other\n")
      .replace("  status: green\n", "  status: amber\n")
      .replace('  notes: "Fictional provider for the schema tests."\n', '  notes: "Ask owner@mail.acme.io"\n');
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider"),
      "acme/invoices.get.yaml": record,
      "acme/tags.update.yaml": "id: [broken\nnotes: owner@mail.acme.io\n",
      "beta/_provider.yaml": provider,
    });
    expect(brief(check(root))).toEqual([
      "invoices.get.yaml V1 id",
      "invoices.get.yaml V18 id",
      "invoices.get.yaml schema class",
      "invoices.get.yaml V16 notes",
      "tags.update.yaml yaml (file)",
      "tags.update.yaml V16 (file)",
      "_provider.yaml V1 id",
      "_provider.yaml V18 id",
      "_provider.yaml schema terms.status",
      "_provider.yaml V16 terms.notes",
    ]);
  });

  it("uses PALIN_PROBE_MAIL_DOMAIN only when no probe domain is passed", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), LICENSE: "mail run-1@probe.palin.dev\n" });
    const previous = process.env.PALIN_PROBE_MAIL_DOMAIN;
    try {
      process.env.PALIN_PROBE_MAIL_DOMAIN = "probe.palin.dev";
      expect(validateRepo({ root, now: NOW }).problems).toEqual([]);
      expect(brief(validateRepo({ root, now: NOW, probeMailDomain: undefined }).problems)).toEqual(["LICENSE V16 (file)"]);
      delete process.env.PALIN_PROBE_MAIL_DOMAIN;
      expect(brief(validateRepo({ root, now: NOW }).problems)).toEqual(["LICENSE V16 (file)"]);
    } finally {
      if (previous === undefined) delete process.env.PALIN_PROBE_MAIL_DOMAIN;
      else process.env.PALIN_PROBE_MAIL_DOMAIN = previous;
    }
  });

  it("passes a data root that holds only LICENSE, like a fresh data/", () => {
    expect(check(tempRoot({ LICENSE: "Creative Commons Attribution 4.0 International\n" }))).toEqual([]);
  });

  it("knows a record by its file name too, so a wrong id or a broken file doesn't cascade into related", () => {
    const send = baseText("r3").replace("last_verified: 2026-09-28\n", "last_verified: 2026-09-28\nrelated: [acme.invoices.get, acme.tags.update]\n");
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider"),
      "acme/invoices.send.yaml": send,
      "acme/invoices.get.yaml": baseText("r0").replace("id: acme.invoices.get\n", "id: acme.invoices.fetch\n"),
      "acme/tags.update.yaml": "id: [x\n",
    });
    expect(brief(check(root)).filter((line) => line.includes("V17"))).toEqual([]);
  });

  it("reports symlinks instead of following them", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider") });
    symlinkSync(join(VALID_ROOT, "acme", "tags.update.yaml"), join(root, "acme", "tags.update.yaml"));
    symlinkSync(join(VALID_ROOT, "acme"), join(root, "acme2"));
    const result = validateRepo({ root, now: NOW, probeMailDomain: undefined });
    expect(brief(result.problems)).toEqual(["tags.update.yaml V1 (file)", "acme2 V1 (file)"]);
    expect(result.records).toBe(0);
  });

  it("checks the valid root with every rule and finds nothing", () => {
    expect(check(VALID_ROOT)).toEqual([]);
  });
});

describe("validateRecord", () => {
  it("runs the schema, then the record rules", () => {
    expect(validateRecord(base.r0(), { now: NOW })).toEqual([]);
    const record = base.r0();
    record.recommended_policy = "allow";
    record.flags = { ...record.flags, moves_money: true };
    expect(validateRecord(record, { now: NOW }).map((problem) => problem.rule)).toEqual(["V7", "V14"]);
  });

  it("stops at schema problems", () => {
    expect(validateRecord({ id: "acme.invoices.get" }, { now: NOW }).every((problem) => problem.rule === "schema")).toBe(true);
  });

  it("runs every record rule except the file rules", () => {
    expect(RECORD_RULES.map(([rule]) => rule)).toEqual([
      "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12", "V13", "V14", "V15", "V19", "V20", "V21", "V22", "V24",
    ]);
  });
});
