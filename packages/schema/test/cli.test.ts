import { chmodSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { USAGE, main, nearestDataRoot } from "../src/main.js";
import { FIXTURES, NOW, VALID_ROOT, baseText, invalidRoot, removeTempRoots, tempRoot } from "./helpers.js";

afterAll(removeTempRoots);

function run(argv: string[], cwd = FIXTURES, now: string = NOW, defaultRoot?: string): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const code = main(argv, {
    cwd,
    ...(defaultRoot === undefined ? {} : { defaultRoot }),
    now,
    probeMailDomain: undefined,
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
  });
  return { code, out, err };
}

const LINE = /^\S+:\d+:\d+ {2}(V\d+|schema|yaml)( \(warning\))? {2}\S+ {2}.+$/;
const FAKE_OPTION = "sk_test_FAKE0000000000000000"; // FAKE

describe("pnpm validate", () => {
  it("validates ./data when no files are given", () => {
    const { code, out } = run([], dirname(VALID_ROOT));
    expect(code).toBe(0);
    expect(out).toBe("No problems (4 records and 1 provider file in data).\n");
  });

  it("uses the default root it's given rather than the working directory's data/", () => {
    expect(run([], FIXTURES, NOW, VALID_ROOT).out).toBe("No problems (4 records and 1 provider file in valid/data).\n");
  });

  it("prints file:line:col, rule, field path and message, and exits 1 on errors", () => {
    const { code, out } = run(["--root", invalidRoot("V13")]);
    const lines = out.trimEnd().split("\n");
    expect(code).toBe(1);
    expect(lines[0]).toMatch(LINE);
    expect(lines[0]).toBe(
      "invalid/V13/data/acme/tags.update.yaml:33:3  V13  suggested_annotations.destructiveHint  must be true: R2 sets destructiveHint to flags.modifies_existing (true)",
    );
    expect(lines[1]).toBe("1 error and 0 warnings (1 record and 1 provider file in invalid/V13/data).");
  });

  it.each(["V16", "schema", "yaml", "V2", "V1"])("exits 1 on invalid/%s, with every line in the same format", (rule) => {
    const { code, out } = run(["--root", invalidRoot(rule)]);
    expect(code).toBe(1);
    for (const line of out.trimEnd().split("\n").slice(0, -1)) expect(line).toMatch(LINE);
  });

  it("exits 0 when there are only warnings", () => {
    const { code, out } = run(["--root", invalidRoot("V18")]);
    expect(code).toBe(0);
    expect(out).toContain("V18 (warning)");
  });

  it("finds the data root from a named file and reports only that file", () => {
    const file = join(invalidRoot("V17"), "acme", "invoices.get.yaml");
    const { code, out } = run([file]);
    expect(code).toBe(1);
    expect(out.trimEnd().split("\n")).toEqual([
      "invalid/V17/data/acme/invoices.get.yaml:5:1  V17  operation  same operation as acme.invoices.retrieve (GET /v1/invoices/{}); within a provider each operation has one record",
      "1 error and 0 warnings in 1 named file (2 records and 1 provider file in invalid/V17/data).",
    ]);
  });

  it("handles files from several data roots in one run, with a summary per root", () => {
    const { code, out } = run([join(invalidRoot("V13"), "acme", "tags.update.yaml"), join(VALID_ROOT, "acme", "invoices.get.yaml")]);
    expect(code).toBe(1);
    expect(out).toContain("1 error and 0 warnings in 1 named file (1 record and 1 provider file in invalid/V13/data).");
    expect(out).toContain("No problems in 1 named file (4 records and 1 provider file in valid/data).");
  });

  it("drops the -- that pnpm passes through", () => {
    expect(run(["--", "--root", VALID_ROOT]).code).toBe(0);
  });

  it("uses the injected date", () => {
    expect(run(["--root", VALID_ROOT], FIXTURES, "2026-09-28").out).toContain("V6  last_verified  is after today (2026-09-28)");
  });

  it("passes a data root that holds only LICENSE", () => {
    expect(run(["--root", tempRoot({ LICENSE: "license text\n" })]).code).toBe(0);
  });

  it("reports a named symlink as a V1 problem rather than following it", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider") });
    const link = join(root, "acme", "tags.update.yaml");
    symlinkSync(join(VALID_ROOT, "acme", "tags.update.yaml"), link);
    const { code, out } = run([link], root);
    expect(code).toBe(1);
    expect(out).toContain("acme/tags.update.yaml:1:1  V1  (file)  symlinks aren't followed");
  });

  it("follows a symlinked directory in a named path to the real file, and refuses it outside --root", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider") });
    symlinkSync(join(VALID_ROOT, "acme"), join(root, "acme2"));
    const through = join(root, "acme2", "tags.update.yaml");
    expect(run([through], root).out).toContain("No problems in 1 named file (4 records and 1 provider file in");
    const { code, err } = run(["--root", root, through], root);
    expect(code).toBe(2);
    expect(err).toMatch(/isn't inside the data root/);
  });

  it("exits 2 with a one-line message when a file can't be read", () => {
    if (process.getuid?.() === 0) return; // root reads anything
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/invoices.get.yaml": baseText("r0") });
    const file = join(root, "acme", "invoices.get.yaml");
    chmodSync(file, 0o000);
    try {
      const { code, err } = run(["--root", root]);
      expect(code).toBe(2);
      expect(err).toMatch(/^Couldn't read the data root .+: EACCES/);
    } finally {
      chmodSync(file, 0o644);
    }
  });

  it.each([
    [["--nope"], /Unknown option/],
    [["--quotes"], /V23/],
    [["missing.yaml"], /no such file/],
    [[FIXTURES], /is a directory/],
    [["--root", join(FIXTURES, "nowhere")], /not a directory/],
    [["--root", VALID_ROOT, join(invalidRoot("V1"), "acme", "invoices.get.yaml")], /isn't inside the data root/],
  ])("exits 2 on a usage error: %j", (argv, message) => {
    const { code, err } = run(argv);
    expect(code).toBe(2);
    expect(err).toMatch(message);
  });

  it("exits 2 when there's no data root to find", () => {
    const root = tempRoot({});
    // The working directory is the temporary data root itself, which has no data/ inside it.
    expect(run([], root).code).toBe(2);
    expect(nearestDataRoot(join(dirname(root), "notes.yaml"))).toBeUndefined();
  });

  it("redacts a secret typed as an option", () => {
    const { code, err } = run([`--${FAKE_OPTION}`]);
    expect(code).toBe(2);
    expect(err).not.toContain(FAKE_OPTION);
  });

  it("prints usage for --help", () => {
    expect(run(["--help"])).toEqual({ code: 0, out: USAGE, err: "" });
  });

  it("finds the nearest ancestor named data", () => {
    expect(nearestDataRoot("/repo/data/acme/x.yaml")).toBe("/repo/data");
    expect(nearestDataRoot("/repo/fixtures/valid/data/acme/x.yaml")).toBe("/repo/fixtures/valid/data");
    expect(nearestDataRoot("/repo/acme/x.yaml")).toBeUndefined();
  });
});
