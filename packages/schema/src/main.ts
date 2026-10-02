import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { fixText } from "./fix.js";
import { displayPath, formatProblem } from "./problems.js";
import { redactSecrets } from "./secrets.js";
import { fileIdentity, validateRepo } from "./validate.js";

export const USAGE = `Usage: pnpm validate [files...] [--root <dir>] [--fix]

Checks Palin records and provider files against docs/SCHEMA.md: the JSON Schemas and rules
V1 to V22 and V24.

  files         Report only problems in these files. Every record in their data root still
                loads, so V2 and V17 see them all. A file's data root is its nearest ancestor
                directory named data, unless --root is given.
  --root <dir>  The data root (default: data/ in the repository).
  --fix         Reorder keys and quote values as V18 asks, then validate again.
  --help        Show this help.

Each problem prints as: file:line:col  rule  field  message
Rule ids: V1 to V24, schema (JSON Schema), yaml (parse errors). V18 problems are warnings.
Exit codes: 0 no errors (warnings allowed), 1 errors, 2 usage or read error.
`;

export interface CliIo {
  /** Relative paths in arguments and output are relative to this directory. */
  cwd: string;
  /** The data root when neither files nor --root are given (default: data/ under cwd). */
  defaultRoot?: string;
  /** Today for V6 (default: today in UTC). */
  now?: string | Date;
  /** PALIN_PROBE_MAIL_DOMAIN, the email domain V16 allows besides the example domains. */
  probeMailDomain?: string | undefined;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function inside(file: string, dir: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** A directory's canonical path (symlinks resolved, on-disk case on case-insensitive systems). */
function real(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    return dir;
  }
}

/** The nearest ancestor directory named `data`. */
export function nearestDataRoot(file: string): string | undefined {
  let dir = dirname(file);
  for (;;) {
    if (basename(dir) === "data") return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Runs `pnpm validate` and returns its exit code. */
export function main(argv: readonly string[], io: CliIo): number {
  // pnpm passes a leading `--` through to the script.
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let values: { root?: string | undefined; fix?: boolean | undefined; help?: boolean | undefined; quotes?: boolean | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        root: { type: "string" },
        fix: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        quotes: { type: "boolean" },
      },
    }));
  } catch (error) {
    io.stderr(`${redactSecrets((error as Error).message)}\n\n${USAGE}`);
    return 2;
  }
  if (values.help === true) {
    io.stdout(USAGE);
    return 0;
  }
  if (values.quotes === true) {
    io.stderr("--quotes runs rule V23, which needs the network; it arrives in week 2 (docs/ROADMAP.md).\n");
    return 2;
  }

  const base = real(io.cwd);
  const show = (path: string) => redactSecrets(displayPath(path, base));
  const fail = (message: string) => {
    io.stderr(`${redactSecrets(message)}\n`);
    return 2;
  };
  const rootOption = values.root === undefined ? undefined : resolve(io.cwd, values.root);
  if (rootOption !== undefined && !isDirectory(rootOption)) return fail(`--root ${values.root}: not a directory`);

  // Data root → the files to report on (undefined: everything in the root).
  const groups = new Map<string, string[] | undefined>();
  if (positionals.length === 0) {
    const root = rootOption ?? io.defaultRoot ?? resolve(io.cwd, "data");
    if (!isDirectory(root)) return fail(`No data root at ${show(root)}; run from the repository or pass --root <dir>.`);
    groups.set(real(root), undefined);
  } else {
    for (const arg of positionals) {
      const given = resolve(io.cwd, arg);
      if (!existsSync(given)) return fail(`${arg}: no such file`);
      if (statSync(given).isDirectory()) return fail(`${arg} is a directory; name files, or use --root <dir> to validate a whole data root`);
      // Canonicalize the directory but not the file, so a symlink is checked as the link itself.
      const file = join(real(dirname(given)), basename(given));
      const root = rootOption === undefined ? nearestDataRoot(file) : real(rootOption);
      if (root === undefined) return fail(`${arg}: no ancestor directory is named data; pass --root <dir>`);
      if (!inside(file, root)) return fail(`${arg} isn't inside the data root ${show(root)}`);
      groups.set(root, [...(groups.get(root) ?? []), file]);
    }
  }

  let errors = 0;
  const output: string[] = [];
  for (const [root, files] of groups) {
    const options = { root, now: io.now, probeMailDomain: io.probeMailDomain, files };
    let result;
    try {
      if (values.fix === true) {
        const toFix = new Set(validateRepo(options).problems.filter((problem) => problem.rule === "V18").map((problem) => problem.file));
        for (const file of toFix) {
          try {
            const fixed = fixText(readFileSync(file, "utf8"), basename(file) === "_provider.yaml" ? "provider" : "record");
            if (fixed.changed) {
              writeFileSync(file, fixed.text);
              output.push(`fixed ${show(file)}`);
            }
          } catch (error) {
            io.stderr(`${show(file)}: ${redactSecrets((error as Error).message)}\n`);
          }
        }
      }
      result = validateRepo(options);
    } catch (error) {
      return fail(`Couldn't read the data root ${show(root)}: ${(error as Error).message}`);
    }

    if (files !== undefined) {
      const seen = new Set(result.files.map(fileIdentity));
      const missed = files.filter((file) => !seen.has(fileIdentity(file)));
      if (missed.length > 0) {
        return fail(`${missed.map(show).join(", ")}: not validated; the validator reads only files inside the data root, never through a symlink`);
      }
    }

    let groupErrors = 0;
    for (const problem of result.problems) {
      output.push(formatProblem(problem, base));
      if (problem.severity === "error") groupErrors += 1;
    }
    const groupWarnings = result.problems.length - groupErrors;
    errors += groupErrors;
    const loaded = `${plural(result.records, "record")} and ${plural(result.providers, "provider file")} in ${show(root)}`;
    const found =
      result.problems.length === 0 ? "No problems" : `${plural(groupErrors, "error")} and ${plural(groupWarnings, "warning")}`;
    output.push(files === undefined ? `${found} (${loaded}).` : `${found} in ${plural(files.length, "named file")} (${loaded}).`);
  }
  io.stdout(`${output.join("\n")}\n`);
  return errors > 0 ? 1 : 0;
}
