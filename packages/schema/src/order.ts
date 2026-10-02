// The key orders V18 checks and `--fix` applies, from the example blocks in docs/SCHEMA.md.
// Maps whose keys are free-form (`match`, `when.args`, `when.settings`, `tested_on.settings`) aren't ordered.

import { isMap, isScalar, isSeq, Scalar, type Document, type Pair, type YAMLMap } from "yaml";
import type { FileKind } from "./load.js";
import type { PathSegment } from "./paths.js";

export const RECORD_KEYS = [
  "id",
  "provider",
  "title",
  "summary",
  "operation",
  "api_version",
  "mcp_tool_aliases",
  "cli_aliases",
  "class",
  "flags",
  "undo",
  "residue",
  "suggested_annotations",
  "recommended_policy",
  "approval_text",
  "variants",
  "confidence",
  "evidence",
  "last_verified",
  "related",
  "notes",
] as const;

export const PROVIDER_KEYS = [
  "id",
  "name",
  "docs_url",
  "api_reference_url",
  "openapi_url",
  "changelog_url",
  "versioning",
  "current_api_version",
  "terms_url",
  "terms",
  "sandbox",
  "evidence",
  "last_reviewed",
] as const;

export const FLAG_KEYS = [
  "moves_money",
  "reaches_third_parties",
  "changes_permissions",
  "bulk",
  "modifies_existing",
  "needs_admin_scope",
  "idempotent",
] as const;

export const UNDO_KEYS = [
  "method",
  "operation",
  "steps",
  "window",
  "window_condition",
  "compensating_action",
  "capture",
] as const;

export const HINT_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const;

export const EVIDENCE_KEYS: Readonly<Record<string, readonly string[]>> = {
  doc: ["type", "url", "quote", "retrieved", "supports"],
  sandbox_run: [
    "type",
    "run_id",
    "date",
    "environment",
    "result",
    "observed_class",
    "trace_sha256",
    "trace_path",
    "tested_on",
    "vendor_paid",
    "supports",
  ],
  community: ["type", "url", "date", "summary", "supports"],
  vendor_statement: ["type", "url", "date", "quote", "supports"],
  todo: ["type", "field", "note"],
};

type Shape =
  | { kind: "map"; keys: readonly string[]; fields?: Readonly<Record<string, Shape>> }
  | { kind: "list"; item: Shape }
  | { kind: "evidence" }
  | { kind: "capture" };

const OPERATION: Shape = { kind: "map", keys: ["kind", "service", "method", "path"] };
const FLAGS: Shape = { kind: "map", keys: FLAG_KEYS };
const HINTS: Shape = { kind: "map", keys: HINT_KEYS };
const RESIDUE: Shape = { kind: "list", item: { kind: "map", keys: ["kind", "audience", "when", "note", "observed_by"] } };
const UNDO: Shape = {
  kind: "map",
  keys: UNDO_KEYS,
  fields: { operation: OPERATION, capture: { kind: "list", item: { kind: "capture" } } },
};
const EVIDENCE: Shape = { kind: "list", item: { kind: "evidence" } };
const CAPTURE_BEFORE: Shape = { kind: "map", keys: ["before", "field"], fields: { before: OPERATION } };
const TESTED_ON: Shape = { kind: "map", keys: ["plan", "settings", "variant"] };

const RECORD: Shape = {
  kind: "map",
  keys: RECORD_KEYS,
  fields: {
    operation: OPERATION,
    mcp_tool_aliases: {
      kind: "list",
      item: {
        kind: "map",
        keys: ["server", "tool", "match", "operation_from_args"],
        fields: { operation_from_args: { kind: "map", keys: ["method", "path"] } },
      },
    },
    cli_aliases: { kind: "list", item: { kind: "map", keys: ["command", "match"] } },
    flags: FLAGS,
    undo: UNDO,
    residue: RESIDUE,
    suggested_annotations: HINTS,
    variants: {
      kind: "list",
      item: {
        kind: "map",
        keys: [
          "when",
          "class",
          "flags",
          "undo",
          "residue",
          "suggested_annotations",
          "recommended_policy",
          "approval_text",
          "notes",
        ],
        fields: {
          when: { kind: "map", keys: ["args", "settings", "plan"] },
          flags: FLAGS,
          undo: UNDO,
          residue: RESIDUE,
          suggested_annotations: HINTS,
        },
      },
    },
    evidence: EVIDENCE,
  },
};

const PROVIDER: Shape = {
  kind: "map",
  keys: PROVIDER_KEYS,
  fields: {
    terms: {
      kind: "map",
      keys: ["status", "consent", "notes"],
      fields: { consent: { kind: "map", keys: ["date", "from", "reference"] } },
    },
    sandbox: { kind: "map", keys: ["kind", "signup_url", "cost", "notes"] },
    evidence: EVIDENCE,
  },
};

export function keyName(pair: Pair): string | undefined {
  const key = pair.key;
  return isScalar(key) && (typeof key.value === "string" || typeof key.value === "number") ? String(key.value) : undefined;
}

export interface OrderedMap {
  map: YAMLMap;
  path: PathSegment[];
  keys: readonly string[];
}

function visit(node: unknown, shape: Shape, path: PathSegment[], out: OrderedMap[]): void {
  switch (shape.kind) {
    case "map": {
      if (!isMap(node)) return;
      out.push({ map: node, path, keys: shape.keys });
      for (const pair of node.items) {
        const key = keyName(pair);
        const child = key !== undefined && shape.fields !== undefined && Object.hasOwn(shape.fields, key) ? shape.fields[key] : undefined;
        if (key !== undefined && child !== undefined) visit(pair.value, child, [...path, key], out);
      }
      return;
    }
    case "list":
      if (isSeq(node)) node.items.forEach((item, index) => visit(item, shape.item, [...path, index], out));
      return;
    case "evidence": {
      if (!isMap(node)) return;
      const type: unknown = node.get("type");
      // hasOwn: a type such as "constructor" mustn't reach Object.prototype.
      const keys = typeof type === "string" && Object.hasOwn(EVIDENCE_KEYS, type) ? EVIDENCE_KEYS[type] : undefined;
      if (keys === undefined) return;
      visit(node, { kind: "map", keys, fields: type === "sandbox_run" ? { tested_on: TESTED_ON } : {} }, path, out);
      return;
    }
    case "capture":
      if (isMap(node)) visit(node, CAPTURE_BEFORE, path, out);
      return;
  }
}

/** Every map in the document whose key order SCHEMA.md documents, outermost first. */
export function orderedMaps(doc: Document, kind: FileKind): OrderedMap[] {
  const out: OrderedMap[] = [];
  visit(doc.contents, kind === "record" ? RECORD : PROVIDER, [], out);
  return out;
}

/** The first known key that comes after a key it should precede, or undefined when the order is right. */
export function firstOutOfOrder(map: YAMLMap, keys: readonly string[]): { key: string; after: string } | undefined {
  let previousIndex = -1;
  let previousKey = "";
  for (const pair of map.items) {
    const key = keyName(pair);
    const index = key === undefined ? -1 : keys.indexOf(key);
    if (key === undefined || index === -1) continue; // unknown keys are the schema's business
    if (index < previousIndex) return { key, after: previousKey };
    previousIndex = index;
    previousKey = key;
  }
  return undefined;
}

/** The keys present in a map, in documented order. */
export function presentInOrder(map: YAMLMap, keys: readonly string[]): string[] {
  const present = new Set(map.items.map(keyName));
  return keys.filter((key) => present.has(key));
}

export interface QuoteTarget {
  scalar: Scalar;
  path: PathSegment[];
  message: string;
}

const YAML11_BOOLEAN = /^(y|yes|n|no|on|off)$/i;

function plainString(node: unknown): node is Scalar<string> {
  return isScalar(node) && node.type === Scalar.PLAIN && typeof node.value === "string";
}

function mapValue(node: unknown, key: string): unknown {
  return isMap(node) ? node.get(key, true) : undefined;
}

function settingsTargets(settings: unknown, path: PathSegment[], out: QuoteTarget[]): void {
  if (!isMap(settings)) return;
  for (const pair of settings.items) {
    const key = keyName(pair);
    if (key === undefined) continue;
    const values: Array<[unknown, PathSegment[]]> = isSeq(pair.value)
      ? pair.value.items.map((item, index): [unknown, PathSegment[]] => [item, [...path, key, index]])
      : [[pair.value, [...path, key]]];
    for (const [value, valuePath] of values) {
      if (plainString(value) && YAML11_BOOLEAN.test(value.value)) {
        out.push({
          scalar: value,
          path: valuePath,
          message: `write "${value.value}" quoted: YAML 1.1 parsers read an unquoted ${value.value} as a boolean`,
        });
      }
    }
  }
}

/**
 * Plain scalars SCHEMA.md ("Files and ids") asks to quote, because other parsers may type them
 * differently: `idempotent: "no"`, `api_version`, `current_api_version`, `trace_sha256`, and yes, no,
 * on or off values in `settings`.
 */
export function quoteTargets(doc: Document, kind: FileKind): QuoteTarget[] {
  const out: QuoteTarget[] = [];
  const root = doc.contents;
  if (kind === "provider") {
    const version = mapValue(root, "current_api_version");
    if (plainString(version)) {
      out.push({ scalar: version, path: ["current_api_version"], message: "write it quoted: other YAML parsers can read an unquoted version as a date or number" });
    }
    return out;
  }

  const version = mapValue(root, "api_version");
  if (plainString(version)) {
    out.push({ scalar: version, path: ["api_version"], message: "write it quoted: other YAML parsers can read an unquoted version as a date or number" });
  }
  const idempotent = (flags: unknown, path: PathSegment[]) => {
    const value = mapValue(flags, "idempotent");
    if (plainString(value) && value.value === "no") {
      out.push({ scalar: value, path: [...path, "idempotent"], message: 'write "no" quoted: YAML 1.1 parsers read an unquoted no as false' });
    }
  };
  idempotent(mapValue(root, "flags"), ["flags"]);

  const variants = mapValue(root, "variants");
  if (isSeq(variants)) {
    variants.items.forEach((variant, index) => {
      idempotent(mapValue(variant, "flags"), ["variants", index, "flags"]);
      settingsTargets(mapValue(mapValue(variant, "when"), "settings"), ["variants", index, "when", "settings"], out);
    });
  }

  const evidence = mapValue(root, "evidence");
  if (isSeq(evidence)) {
    evidence.items.forEach((item, index) => {
      const hash = mapValue(item, "trace_sha256");
      if (plainString(hash)) {
        out.push({ scalar: hash, path: ["evidence", index, "trace_sha256"], message: "write it quoted: a hash made only of digits would read as a number" });
      }
      settingsTargets(mapValue(mapValue(item, "tested_on"), "settings"), ["evidence", index, "tested_on", "settings"], out);
    });
  }
  return out;
}
