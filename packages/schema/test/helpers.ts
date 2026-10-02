import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import type { ProviderFile } from "../src/generated/provider.js";
import type { PalinRecord } from "../src/generated/record.js";
import { parseYaml } from "../src/load.js";
import type { Problem, ProblemRule } from "../src/problems.js";
import { validateRecord, validateRepo, type ValidateOptions } from "../src/validate.js";

/** The fixed "today" every test validates against. */
export const NOW = "2026-10-01";
export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const VALID_ROOT = join(FIXTURES, "valid", "data");

export function invalidRoot(name: string): string {
  return join(FIXTURES, "invalid", name, "data");
}

type BaseName = "provider" | "r0" | "r1" | "r2" | "r3" | "r4" | "r5";

/** The text of a base file in test/fixtures/bases: a provider file and one clean record per class. */
export function baseText(name: BaseName): string {
  return readFileSync(join(FIXTURES, "bases", `${name}.yaml`), "utf8");
}

function load<T>(name: BaseName): T {
  return parseYaml(baseText(name)).data as T;
}

/** Fresh copies of the base records, each valid on its own, to change one thing in. */
export const base = {
  provider: () => load<ProviderFile>("provider"),
  r0: () => load<PalinRecord>("r0"),
  r1: () => load<PalinRecord>("r1"),
  r2: () => load<PalinRecord>("r2"),
  r3: () => load<PalinRecord>("r3"),
  r4: () => load<PalinRecord>("r4"),
  r5: () => load<PalinRecord>("r5"),
};

/**
 * validateRepo on a fixture root with the fixed date and no probe domain. Also checks the severity
 * invariant: V18 problems are warnings and every other problem is an error (exit 1).
 */
export function check(root: string, options: Partial<ValidateOptions> = {}): Problem[] {
  const problems = validateRepo({ root, now: NOW, probeMailDomain: undefined, ...options }).problems;
  for (const problem of problems) {
    expect(problem.severity, `${problem.rule} ${problem.path}`).toBe(problem.rule === "V18" ? "warning" : "error");
  }
  return problems;
}

/** `file rule path` per problem, for compact assertions. */
export function brief(problems: readonly Problem[]): string[] {
  return problems.map((problem) => `${basename(problem.file)} ${problem.rule} ${problem.path}`);
}

/** `rule path` per problem validateRecord finds in an in-memory record (base provider, fixed date). */
export function problemsOf(record: unknown, options: { now?: string; provider?: ProviderFile | undefined } = {}): string[] {
  return validateRecord(record, { now: NOW, provider: base.provider(), ...options }).map(
    (problem) => `${problem.rule} ${problem.path}`,
  );
}

/** The two tests every rule has: no problems of it in the valid root, and only it on its invalid root. */
export function fixtureTests(rule: ProblemRule, expected: readonly string[]): void {
  it(`finds no ${rule} problems in the valid root`, () => {
    expect(check(VALID_ROOT).filter((problem) => problem.rule === rule)).toEqual([]);
  });
  it(`fails only ${rule} on invalid/${rule}`, () => {
    expect(brief(check(invalidRoot(rule)))).toEqual(expected);
  });
}

const tempDirs: string[] = [];

/** Writes files (paths relative to the root) into a new temporary `data` directory and returns it. */
export function tempRoot(files: Record<string, string | Buffer>): string {
  const parent = mkdtempSync(join(tmpdir(), "palin-schema-"));
  tempDirs.push(parent);
  const root = join(parent, "data");
  mkdirSync(root, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

/** Deletes the directories tempRoot made; call it from afterAll. */
export function removeTempRoots(): void {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}
