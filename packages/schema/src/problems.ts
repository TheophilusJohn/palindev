import { isAbsolute, relative, sep } from "node:path";
import { redactSecrets } from "./secrets.js";

/** The offline rules, one function each. V23 needs the network and runs only with `--quotes`. */
export const RULE_IDS = [
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
  "V11",
  "V12",
  "V13",
  "V14",
  "V15",
  "V16",
  "V17",
  "V18",
  "V19",
  "V20",
  "V21",
  "V22",
  "V24",
] as const;

export type RuleId = (typeof RULE_IDS)[number];
/** `schema` for JSON Schema failures, `yaml` for parse errors. */
export type ProblemRule = RuleId | "schema" | "yaml";
export type Severity = "error" | "warning";

/** The path reported for a problem with a whole file rather than one field. */
export const FILE_PATH = "(file)";

/** One finding, before it's tied to a file. `path` uses the evidence `supports` syntax (`a.b[0].c`). */
export interface Issue {
  path: string;
  message: string;
  /** 1-based; set by rules that know the position better than the path does (text scans, parse errors). */
  line?: number;
  col?: number;
}

export interface Problem extends Issue {
  /** Absolute path of the file the problem is in. */
  file: string;
  rule: ProblemRule;
  severity: Severity;
}

const RULE_RANK = new Map<ProblemRule, number>([
  ["yaml", -2],
  ["schema", -1],
  ...RULE_IDS.map((id, index) => [id, index] as const),
]);

/** Sorted by file, then position, then rule. */
export function sortProblems(problems: readonly Problem[]): Problem[] {
  return [...problems].sort(
    (a, b) =>
      compare(a.file, b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.col ?? 0) - (b.col ?? 0) ||
      (RULE_RANK.get(a.rule) ?? 0) - (RULE_RANK.get(b.rule) ?? 0) ||
      compare(a.path, b.path),
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A path relative to `cwd` with forward slashes, or the absolute path when it's outside `cwd`. */
export function displayPath(file: string, cwd: string): string {
  const rel = relative(cwd, file);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return file.split(sep).join("/");
  return rel.split(sep).join("/");
}

/**
 * `file:line:col  rule  path  message`, with `(warning)` after the rule id for warnings. A whole-file
 * problem with no position prints as line 1, column 1. Secret-shaped text in the line is redacted.
 */
export function formatProblem(problem: Problem, cwd: string): string {
  const where = `${displayPath(problem.file, cwd)}:${problem.line ?? 1}:${problem.col ?? 1}`;
  const rule = problem.severity === "warning" ? `${problem.rule} (warning)` : problem.rule;
  return redactSecrets(`${where}  ${rule}  ${problem.path}  ${problem.message}`);
}
