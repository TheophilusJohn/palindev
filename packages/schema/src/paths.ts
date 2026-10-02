import { isMap, isScalar, isSeq, type Document, type LineCounter } from "yaml";
import { FILE_PATH } from "./problems.js";

export type PathSegment = string | number;

/** `["variants", 0, "when"]` → `variants[0].when`; an empty path is the whole file. */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = "";
  for (const segment of segments) {
    if (typeof segment === "number") out += `[${segment}]`;
    else out += out === "" ? segment : `.${segment}`;
  }
  return out === "" ? FILE_PATH : out;
}

/** The inverse of formatPath. */
export function parsePath(path: string): PathSegment[] {
  if (path === FILE_PATH) return [];
  const segments: PathSegment[] = [];
  for (const match of path.matchAll(/\[(\d+)\]|([^.[\]]+)/g)) {
    if (match[1] !== undefined) segments.push(Number(match[1]));
    else if (match[2] !== undefined) segments.push(match[2]);
  }
  return segments;
}

/** A JSON Pointer (Ajv's instancePath) as path segments; all-digit segments are list indexes. */
export function pointerToSegments(pointer: string): PathSegment[] {
  if (pointer === "") return [];
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function start(node: unknown): number | undefined {
  if (node !== null && typeof node === "object" && "range" in node && Array.isArray(node.range)) {
    const value: unknown = node.range[0];
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

function end(node: unknown): number | undefined {
  if (node !== null && typeof node === "object" && "range" in node && Array.isArray(node.range)) {
    const value: unknown = node.range[1];
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

function keyText(key: unknown): string | undefined {
  return isScalar(key) && (typeof key.value === "string" || typeof key.value === "number")
    ? String(key.value)
    : undefined;
}

/**
 * The 1-based position of a path in a parsed document: the key of the deepest entry that exists,
 * so a missing key points at its parent.
 */
export function locate(
  doc: Document,
  lineCounter: LineCounter,
  segments: readonly PathSegment[],
): { line: number; col: number } | undefined {
  let node: unknown = doc.contents;
  let position = start(node);
  for (const segment of segments) {
    if (isMap(node)) {
      const pair = node.items.find((item) => keyText(item.key) === String(segment));
      if (pair === undefined) break;
      position = start(pair.key) ?? position;
      node = pair.value;
    } else if (isSeq(node) && typeof segment === "number") {
      const item: unknown = node.items[segment];
      if (item === undefined) break;
      position = start(item) ?? position;
      node = item;
    } else {
      break;
    }
  }
  return position === undefined ? undefined : lineCounter.linePos(position);
}

/**
 * The index of the last item whose start is at or before `offset`, by binary search: items are in
 * source order, so a long list or map costs a logarithmic lookup per finding.
 */
function lastStartingBefore<T>(items: readonly T[], offset: number, startOf: (item: T) => number | undefined): number {
  let low = 0;
  let high = items.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const from = startOf(items[middle] as T);
    if (from !== undefined && from <= offset) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** The path of the deepest node that contains a text offset, or an empty path outside every node. */
export function pathAtOffset(doc: Document, offset: number): PathSegment[] {
  const segments: PathSegment[] = [];
  let node: unknown = doc.contents;
  for (;;) {
    let next: unknown;
    if (isMap(node)) {
      const pair = node.items[lastStartingBefore(node.items, offset, (item) => start(item.key) ?? start(item.value))];
      const key = pair === undefined ? undefined : keyText(pair.key);
      const to = pair === undefined ? undefined : (end(pair.value) ?? end(pair.key));
      if (pair !== undefined && key !== undefined && to !== undefined && offset < to) {
        segments.push(key);
        const keyEnd = end(pair.key);
        next = keyEnd !== undefined && offset < keyEnd ? undefined : pair.value;
      }
    } else if (isSeq(node)) {
      const index = lastStartingBefore(node.items, offset, start);
      const item: unknown = node.items[index];
      const to = end(item);
      if (item !== undefined && to !== undefined && offset < to) {
        segments.push(index);
        next = item;
      }
    }
    if (next === undefined || next === null) return segments;
    node = next;
  }
}
