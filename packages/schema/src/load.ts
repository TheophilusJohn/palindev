import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { extname, join } from "node:path";
import { LineCounter, isNode, isPair, parseDocument, visit, type Document } from "yaml";

export type FileKind = "record" | "provider";

export interface YamlError {
  message: string;
  line: number;
  col: number;
}

export interface ParsedYaml {
  doc: Document;
  lineCounter: LineCounter;
  /** Parser errors. When there are any, `data` is undefined. */
  errors: YamlError[];
  data: unknown;
}

export interface YamlFile extends ParsedYaml {
  kind: FileKind;
  /** Absolute path. */
  file: string;
  /** The provider directory's name. */
  providerDir: string;
  /** The file name without its extension. */
  stem: string;
}

export interface Misplaced {
  file: string;
  message: string;
}

export interface DataRoot {
  root: string;
  /** Provider file by provider directory. */
  providers: Map<string, YamlFile>;
  records: YamlFile[];
  /** Files that break the layout in SCHEMA.md "Files and ids", symlinks included (reported under V1). */
  misplaced: Misplaced[];
  /** Every regular file under the root, dotfiles included, for V16. Symlinks are never followed. */
  files: string[];
}

/** Non-record files allowed directly in a data root. */
export const ROOT_FILES: ReadonlySet<string> = new Set(["LICENSE", "README.md"]);

const SYMLINK = "symlinks aren't followed; commit the file or directory itself";

/** Tags that turn into JS values other than plain objects, arrays and scalars. */
const NON_PLAIN_TAGS: ReadonlyMap<string, string> = new Map([
  ["tag:yaml.org,2002:omap", "!!omap"],
  ["tag:yaml.org,2002:pairs", "!!pairs"],
  ["tag:yaml.org,2002:set", "!!set"],
  ["tag:yaml.org,2002:binary", "!!binary"],
  ["tag:yaml.org,2002:timestamp", "!!timestamp"],
]);

/** Whether parsed data holds anything but plain objects, arrays and scalars (a Map, Set, Date or bytes). */
function hasNonPlain(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (value instanceof Map || value instanceof Set || value instanceof Date || ArrayBuffer.isView(value)) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  return (Array.isArray(value) ? value : Object.values(value)).some((item) => hasNonPlain(item, seen));
}

/**
 * Parses YAML 1.2 with the core schema (the `yaml` package's defaults); duplicate keys are errors.
 * Records hold only plain mappings, lists and scalars, so tags such as !!omap or !!set, which would
 * hide their contents from the schema and from V16, are errors too.
 */
export function parseYaml(text: string): ParsedYaml {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  const errors: YamlError[] = doc.errors.map((error) => {
    const { line, col } = lineCounter.linePos(error.pos[0]);
    return { message: error.message.split("\n")[0] ?? error.message, line, col };
  });
  if (errors.length === 0) {
    visit(doc, (_key, node, path) => {
      const tag = isNode(node) ? node.tag : undefined;
      const name = tag === undefined ? undefined : NON_PLAIN_TAGS.get(tag);
      if (name !== undefined && isNode(node)) {
        // Point at the key that holds the tagged value; a collection's own range starts at its first item.
        const parent = path[path.length - 1];
        const at = isPair(parent) && isNode(parent.key) ? parent.key.range?.[0] : node.range?.[0];
        const { line, col } = lineCounter.linePos(at ?? 0);
        errors.push({ message: `${name} isn't allowed: a record holds only plain mappings, lists and scalars`, line, col });
      }
    });
  }
  let data: unknown;
  if (errors.length === 0) {
    try {
      data = doc.toJS({ maxAliasCount: 100 });
      if (hasNonPlain(data)) errors.push({ message: "holds a value that isn't a plain mapping, list or scalar", line: 1, col: 1 });
    } catch (error) {
      errors.push({ message: (error as Error).message, line: 1, col: 1 });
    }
  }
  return { doc, lineCounter, errors, data: errors.length === 0 ? data : undefined };
}

function loadYaml(file: string, kind: FileKind, providerDir: string, stem: string): YamlFile {
  return { kind, file, providerDir, stem, ...parseYaml(readFileSync(file, "utf8")) };
}

function entries(dir: string): Dirent[] {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Collects regular files and symlinks under `dir`, never following a symlink. */
function walk(dir: string, files: string[], links: string[], skipDotfiles: boolean): void {
  for (const entry of entries(dir)) {
    if (skipDotfiles && entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) links.push(path);
    else if (entry.isDirectory()) walk(path, files, links, skipDotfiles);
    else if (entry.isFile()) files.push(path);
  }
}

/**
 * Loads a data root: `<root>/<provider>/_provider.yaml` and `<root>/<provider>/<resource>.<verb>.yaml`.
 * Dotfiles are skipped for the layout but still scanned by V16. Symlinks are reported, never followed.
 */
export function loadDataRoot(root: string): DataRoot {
  const providers = new Map<string, YamlFile>();
  const records: YamlFile[] = [];
  const misplaced: Misplaced[] = [];
  const files: string[] = [];
  const links: string[] = [];
  walk(root, files, links, false);
  for (const link of links) misplaced.push({ file: link, message: SYMLINK });

  for (const entry of entries(root)) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isFile()) {
      if (!ROOT_FILES.has(entry.name)) {
        misplaced.push({
          file: path,
          message: "only provider directories, LICENSE and README.md belong in the data root; records live in <provider>/<resource>.<verb>.yaml",
        });
      }
      continue;
    }
    if (!entry.isDirectory()) continue;

    const providerDir = entry.name;
    for (const sub of entries(path)) {
      if (sub.name.startsWith(".") || sub.isSymbolicLink()) continue;
      const subPath = join(path, sub.name);
      if (sub.isDirectory()) {
        const nested: string[] = [];
        walk(subPath, nested, [], true);
        for (const file of nested) {
          misplaced.push({ file, message: "records live directly in their provider's directory, not in a subdirectory" });
        }
        continue;
      }
      if (!sub.isFile()) continue;
      const ext = extname(sub.name);
      const stem = sub.name.slice(0, sub.name.length - ext.length);
      if (sub.name === "_provider.yaml") {
        providers.set(providerDir, loadYaml(subPath, "provider", providerDir, stem));
      } else if (sub.name === "_provider.yml") {
        misplaced.push({ file: subPath, message: "name the provider file _provider.yaml" });
      } else if (ext === ".yaml" || ext === ".yml") {
        records.push(loadYaml(subPath, "record", providerDir, stem));
        if (ext === ".yml") misplaced.push({ file: subPath, message: "record files end in .yaml" });
      } else {
        misplaced.push({
          file: subPath,
          message: "provider directories hold only _provider.yaml and <resource>.<verb>.yaml files",
        });
      }
    }
  }
  return { root, providers, records, misplaced, files };
}
