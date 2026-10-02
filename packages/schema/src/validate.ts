import { lstatSync, readFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { todayUtc } from "./formats.js";
import type { ProviderFile } from "./generated/provider.js";
import type { PalinRecord } from "./generated/record.js";
import { loadDataRoot, type YamlFile } from "./load.js";
import { formatPath, locate, parsePath, pathAtOffset, type PathSegment } from "./paths.js";
import { FILE_PATH, sortProblems, type Issue, type Problem, type ProblemRule, type Severity } from "./problems.js";
import type { RecordRule, RecordRuleContext } from "./rules/context.js";
import { v1Provider, v1Record } from "./rules/v1.js";
import { v2 } from "./rules/v2.js";
import { v3 } from "./rules/v3.js";
import { v4 } from "./rules/v4.js";
import { v5 } from "./rules/v5.js";
import { v6 } from "./rules/v6.js";
import { v7 } from "./rules/v7.js";
import { v8 } from "./rules/v8.js";
import { v9 } from "./rules/v9.js";
import { v10 } from "./rules/v10.js";
import { v11 } from "./rules/v11.js";
import { v12 } from "./rules/v12.js";
import { v13 } from "./rules/v13.js";
import { v14 } from "./rules/v14.js";
import { v15Provider, v15Record } from "./rules/v15.js";
import { v16 } from "./rules/v16.js";
import { v17, type V17Record } from "./rules/v17.js";
import { v18 } from "./rules/v18.js";
import { v19 } from "./rules/v19.js";
import { v20 } from "./rules/v20.js";
import { v21 } from "./rules/v21.js";
import { v22 } from "./rules/v22.js";
import { v24 } from "./rules/v24.js";
import { checkSchema } from "./schema-check.js";
import { redactSecrets } from "./secrets.js";
import { checkStructure } from "./structural.js";

/** Rules that check one schema-valid record on its own. */
export const RECORD_RULES: ReadonlyArray<readonly [ProblemRule, RecordRule]> = [
  ["V3", v3],
  ["V4", v4],
  ["V5", v5],
  ["V6", v6],
  ["V7", v7],
  ["V8", v8],
  ["V9", v9],
  ["V10", v10],
  ["V11", v11],
  ["V12", v12],
  ["V13", v13],
  ["V14", v14],
  ["V15", v15Record],
  ["V19", v19],
  ["V20", v20],
  ["V21", v21],
  ["V22", v22],
  ["V24", v24],
];

export interface ValidateOptions {
  /** The data root: a directory of `<provider>/` directories. */
  root: string;
  /** Today for V6, as YYYY-MM-DD or a Date (default: today in UTC). */
  now?: string | Date | undefined;
  /** Email domain allowed by V16 besides the example domains (default: PALIN_PROBE_MAIL_DOMAIN). */
  probeMailDomain?: string | undefined;
  /**
   * Report only problems in these files (matched by identity, so case and symlinked directories in
   * the path don't matter). Every record still loads, for V2 and V17. Naming a `_provider.yaml` also
   * reports its directory's records; naming a record whose provider file is invalid also reports it.
   */
  files?: readonly string[] | undefined;
}

export interface ValidateResult {
  problems: Problem[];
  /** Record files loaded from the root. */
  records: number;
  /** Provider files loaded from the root. */
  providers: number;
  /** Every file the run looked at: regular files, and the symlinks it reported instead of following. */
  files: string[];
}

function toDay(now: string | Date | undefined): string {
  if (now === undefined) return todayUtc();
  return typeof now === "string" ? now : todayUtc(now);
}

function hasUtf16Bom(buffer: Buffer): boolean {
  return (buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff);
}

/** The text of a file, decoding UTF-16 by its byte-order mark; undefined for a binary file. */
function readText(buffer: Buffer): string | undefined {
  let text: string;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = buffer.subarray(2).toString("utf16le");
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    text = Buffer.from(buffer.subarray(2, 2 + ((buffer.length - 2) & ~1))).swap16().toString("utf16le");
  } else text = buffer.toString("utf8");
  // A NUL in the text means binary data, or UTF-32 behind a UTF-16 byte-order mark.
  return text.includes("\u0000") ? undefined : text;
}

/**
 * Every string key and value in parsed YAML data, with its path, and each `key: value` pair with a
 * string value (for the secret patterns that need the key name, such as an AWS secret access key
 * whose value sits on the next line). Each object is walked once, so aliases can't loop or fan out.
 */
function* stringsIn(
  value: unknown,
  path: PathSegment[] = [],
  seen: WeakSet<object> = new WeakSet(),
): Generator<{ path: PathSegment[]; text: string; secretsOnly: boolean }> {
  if (typeof value === "string") {
    yield { path, text: value, secretsOnly: false };
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* stringsIn(item, [...path, index], seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    yield { path: [...path, key], text: key, secretsOnly: false };
    if (typeof item === "string") yield { path: [...path, key], text: `${key}: ${item.trim()}`, secretsOnly: true };
    yield* stringsIn(item, [...path, key], seen);
  }
}

/** A file's identity: the same file however its path is spelled. */
export function fileIdentity(file: string): string | undefined {
  try {
    const stat = lstatSync(file);
    return `${stat.dev}:${stat.ino}`;
  } catch {
    return undefined;
  }
}

/**
 * Validates every file under a data root: JSON Schema, then rules V1 to V22 and V24 (V23 needs the
 * network). A file with YAML errors gets only `yaml` problems plus the V1 layout, V2 and V16 checks; a
 * file that fails the schema gets `schema` problems plus V1, V2, V16 and V18. The other rules run only
 * on files that pass the schema, so a broken file doesn't cascade. Each problem's `path` and `message`
 * are redacted, so a secret used as a key or an alias name never reaches them; `file` (and the result's
 * `files`) are real paths, to print only through formatProblem or redactSecrets.
 */
export function validateRepo(options: ValidateOptions): ValidateResult {
  const root = resolve(options.root);
  const now = toDay(options.now);
  const probeMailDomain = "probeMailDomain" in options ? options.probeMailDomain : process.env.PALIN_PROBE_MAIL_DOMAIN;
  const data = loadDataRoot(root);
  const problems: Problem[] = [];

  const add = (file: string, rule: ProblemRule, issues: readonly Issue[], yaml?: YamlFile, severity: Severity = "error") => {
    for (const issue of issues) {
      let { line, col } = issue;
      if (line === undefined && yaml !== undefined) {
        const position = locate(yaml.doc, yaml.lineCounter, parsePath(issue.path));
        line = position?.line;
        col = position?.col;
      }
      problems.push({
        file,
        rule,
        severity,
        path: redactSecrets(issue.path),
        message: redactSecrets(issue.message),
        ...(line === undefined ? {} : { line, col }),
      });
    }
  };
  const yamlIssues = (file: YamlFile): Issue[] =>
    file.errors.map((error) => ({ path: FILE_PATH, message: error.message, line: error.line, col: error.col }));

  // Provider files.
  const validProviders = new Map<string, ProviderFile>();
  for (const [dir, file] of data.providers) {
    if (file.errors.length > 0) {
      add(file.file, "yaml", yamlIssues(file));
      continue;
    }
    const schemaIssues = checkSchema("provider", file.data);
    add(file.file, "schema", schemaIssues, file);
    add(file.file, "V1", v1Provider(file.data, dir), file);
    add(file.file, "V18", v18(file.doc, "provider"), file, "warning");
    if (schemaIssues.length === 0) {
      const provider = file.data as ProviderFile;
      validProviders.set(dir, provider);
      add(file.file, "V15", v15Provider(provider), file);
    }
  }

  // Records. A related id can name a record by its declared id or by its file name.
  const knownIds = new Set<string>();
  for (const file of data.records) {
    knownIds.add(`${file.providerDir}.${file.stem}`);
    const id = (file.data as { id?: unknown } | undefined)?.id;
    if (typeof id === "string") knownIds.add(id);
  }
  const valid: V17Record[] = [];
  for (const file of data.records) {
    add(file.file, "V2", v2({ exists: data.providers.has(file.providerDir), valid: validProviders.has(file.providerDir) }), file);
    if (file.errors.length > 0) {
      add(file.file, "yaml", yamlIssues(file));
      continue;
    }
    add(file.file, "V1", v1Record(file.data, file.providerDir, file.stem), file);
    add(file.file, "V18", v18(file.doc, "record"), file, "warning");
    const schemaIssues = checkSchema("record", file.data);
    const record = file.data as PalinRecord;
    const structural = schemaIssues.length === 0 ? checkStructure(record) : [];
    add(file.file, "schema", [...schemaIssues, ...structural], file);
    if (schemaIssues.length > 0 || structural.length > 0) continue;

    valid.push({ file: file.file, providerDir: file.providerDir, record });
    const context: RecordRuleContext = { now, provider: validProviders.get(file.providerDir) };
    for (const [rule, check] of RECORD_RULES) add(file.file, rule, check(record, context), file);
  }

  const yamlByFile = new Map<string, YamlFile>([...data.records, ...data.providers.values()].map((file) => [file.file, file]));
  for (const [file, issues] of v17(valid, knownIds)) add(file, "V17", issues, yamlByFile.get(file));

  // V16 reads every file under the root as text, dotfiles included, and every file's name.
  for (const file of data.files) {
    const name = relative(root, file).split(sep).join("/");
    add(file, "V16", v16(name, { probeMailDomain }).map((finding) => ({ path: FILE_PATH, message: `the file name ${finding.message}` })));
    const buffer = readFileSync(file);
    // Text behind a UTF-16 byte-order mark has NUL bytes; without any, the mark is misleading and
    // the rest is read as UTF-8.
    const fakeBom = hasUtf16Bom(buffer) && !buffer.subarray(2).includes(0);
    const text = fakeBom ? buffer.subarray(2).toString("utf8") : readText(buffer);
    const issues: Issue[] = [];
    const reported = new Set<string>();
    const report = (issue: Issue) => {
      const key = `${issue.path}\u0000${issue.line ?? ""}\u0000${issue.message}`;
      if (!reported.has(key)) {
        reported.add(key);
        issues.push(issue);
      }
    };
    if (text === undefined || (hasUtf16Bom(buffer) && !fakeBom)) {
      // A binary wrapper or UTF-16 framing mustn't hide a key written in plain bytes...
      for (const finding of v16(buffer.toString("latin1"), { secretsOnly: true })) {
        report({ path: FILE_PATH, message: `has bytes that ${finding.message.replace(/^looks/, "look")}` });
      }
    }
    if (hasUtf16Bom(buffer) && !fakeBom) {
      // ...or an address written in UTF-8 after the mark.
      for (const finding of v16(buffer.subarray(2).toString("utf8"), { probeMailDomain })) {
        report({ path: FILE_PATH, message: finding.message, line: finding.line, col: finding.col });
      }
    }
    if (text === undefined) {
      if (basename(file) !== ".DS_Store") {
        issues.push({ path: FILE_PATH, message: "is a binary file, which V16 can't check for secrets; a data root holds only text files" });
      }
      add(file, "V16", issues);
      continue;
    }
    const parsed = yamlByFile.get(file);
    const clean = parsed !== undefined && parsed.errors.length === 0;
    for (const finding of v16(text, { probeMailDomain })) {
      report({
        path: clean ? formatPath(pathAtOffset(parsed.doc, finding.offset)) : FILE_PATH,
        message: finding.message,
        line: finding.line,
        col: finding.col,
      });
    }
    if (parsed === undefined) {
      // Not YAML, so no parsed values to check: also read past block-scalar headers (`key: |`), which
      // would otherwise separate a key name from its value. Removing them keeps the line numbers.
      const flattened = text.replace(/([:=])[ \t]*[|>][-+0-9]{0,2}[ \t]*(?=\r?\n)/g, "$1");
      if (flattened !== text) {
        for (const finding of v16(flattened, { secretsOnly: true })) {
          report({ path: FILE_PATH, message: finding.message, line: finding.line, col: finding.col });
        }
      }
    }
    if (clean) {
      // The parsed keys and values too: YAML escapes can spell a key the raw text doesn't show.
      const seen = new Set(issues.map((issue) => `${issue.path}\u0000${issue.message}`));
      for (const { path: segments, text: value, secretsOnly } of stringsIn(parsed.data)) {
        const path = formatPath(segments);
        for (const finding of v16(value, { probeMailDomain, secretsOnly })) {
          const key = `${path}\u0000${finding.message}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({ path, message: finding.message });
          }
        }
      }
    }
    add(file, "V16", issues, parsed);
  }

  for (const { file, message } of data.misplaced) add(file, "V1", [{ path: FILE_PATH, message }]);

  let reported = problems;
  if (options.files !== undefined) {
    const identity = new Map<string, string>();
    const idOf = (file: string): string => {
      let id = identity.get(file);
      if (id === undefined) {
        // A file that's gone can't match anything else.
        id = fileIdentity(file) ?? `missing:${file}`;
        identity.set(file, id);
      }
      return id;
    };
    const named = new Set(options.files.map((file) => idOf(resolve(file))));
    const report = new Set(named);
    for (const [dir, provider] of data.providers) {
      const providerNamed = named.has(idOf(provider.file));
      for (const record of data.records.filter((file) => file.providerDir === dir)) {
        if (providerNamed) report.add(idOf(record.file));
        else if (named.has(idOf(record.file)) && !validProviders.has(dir)) report.add(idOf(provider.file));
      }
    }
    reported = problems.filter((problem) => report.has(idOf(problem.file)));
  }

  return {
    problems: sortProblems(reported),
    records: data.records.length,
    providers: data.providers.size,
    files: [...new Set([...data.files, ...data.misplaced.map((entry) => entry.file)])],
  };
}

/** A problem in a record checked in memory, with no file. */
export interface RecordProblem extends Issue {
  rule: ProblemRule;
}

/**
 * Validates one record in memory: the schema, then the rules that need only the record (V3 to V15,
 * V19 to V22, and V24 when `provider` is given). The file rules (V1, V2, V16, V17, V18) need a data root.
 */
export function validateRecord(data: unknown, options: { now?: string | Date; provider?: ProviderFile } = {}): RecordProblem[] {
  const schemaIssues = checkSchema("record", data);
  const redact = (rule: ProblemRule, issue: Issue): RecordProblem => ({
    ...issue,
    rule,
    path: redactSecrets(issue.path),
    message: redactSecrets(issue.message),
  });
  if (schemaIssues.length > 0) return schemaIssues.map((issue) => redact("schema", issue));
  const record = data as PalinRecord;
  const structural = checkStructure(record);
  if (structural.length > 0) return structural.map((issue) => redact("schema", issue));
  const context: RecordRuleContext = { now: toDay(options.now), provider: options.provider };
  return RECORD_RULES.flatMap(([rule, check]) => check(record, context).map((issue) => redact(rule, issue)));
}
