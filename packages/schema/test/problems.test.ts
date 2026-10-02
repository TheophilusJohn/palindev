import { describe, expect, it } from "vitest";
import { displayPath, formatProblem, sortProblems, type Problem } from "../src/problems.js";

const CWD = "/repo";
// Fake secrets here say FAKE on their line.
const FAKE_KEY = "sk_test_FAKE0000000000000000"; // FAKE

function problem(overrides: Partial<Problem>): Problem {
  return { file: "/repo/data/acme/a.yaml", rule: "V13", severity: "error", path: "class", message: "is wrong", ...overrides };
}

describe("problems", () => {
  it("formats file, position, rule, field path and message on one line", () => {
    expect(formatProblem(problem({ line: 12, col: 3 }), CWD)).toBe("data/acme/a.yaml:12:3  V13  class  is wrong");
  });

  it("gives a whole-file problem position 1:1 and marks warnings", () => {
    expect(formatProblem(problem({ rule: "V18", severity: "warning", path: "(file)" }), CWD)).toBe(
      "data/acme/a.yaml:1:1  V18 (warning)  (file)  is wrong",
    );
  });

  it("redacts secrets and email local parts anywhere in the line, file names included", () => {
    const line = formatProblem(problem({ file: `/repo/data/acme/${FAKE_KEY}.yaml`, path: "notes", message: "see alice@corp.io" }), CWD);
    expect(line).not.toContain(FAKE_KEY);
    expect(line).not.toContain("alice");
    expect(line).toContain("[a Stripe secret or restricted key]");
    expect(line).toContain("…@corp.io");
  });

  it("shows paths relative to the working directory when they're inside it", () => {
    expect(displayPath("/repo/data/x.yaml", CWD)).toBe("data/x.yaml");
    expect(displayPath("/elsewhere/x.yaml", CWD)).toBe("/elsewhere/x.yaml");
  });

  it("sorts by file, then line, then yaml and schema before rules", () => {
    const sorted = sortProblems([
      problem({ file: "/repo/data/acme/b.yaml", line: 1 }),
      problem({ line: 9 }),
      problem({ line: 2, rule: "V7" }),
      problem({ line: 2, rule: "schema" }),
    ]);
    expect(sorted.map((p) => `${p.file.slice(-6)}:${p.line} ${p.rule}`)).toEqual(["a.yaml:2 schema", "a.yaml:2 V7", "a.yaml:9 V13", "b.yaml:1 V13"]);
  });
});
