import { isDeepStrictEqual } from "node:util";
import { Scalar, isNode, type LineCounter, type YAMLMap } from "yaml";
import { parseYaml, type FileKind } from "./load.js";
import { keyName, orderedMaps, quoteTargets } from "./order.js";

export interface FixResult {
  text: string;
  changed: boolean;
}

function sortMap(map: YAMLMap, keys: readonly string[]): void {
  const rank = (index: number, key: string | undefined) => {
    const known = key === undefined ? -1 : keys.indexOf(key);
    return { index, known: known === -1 ? keys.length : known };
  };
  map.items = map.items
    .map((pair, index) => ({ pair, ...rank(index, keyName(pair)) }))
    .sort((a, b) => a.known - b.known || a.index - b.index)
    .map(({ pair }) => pair);
}

function lineOf(node: unknown, lineCounter: LineCounter): number | undefined {
  if (!isNode(node) || node.range === undefined || node.range === null) return undefined;
  return lineCounter.linePos(node.range[0]).line;
}

/**
 * What `pnpm validate --fix` does to one file for V18: reorders keys into the documented order at
 * every level (unknown keys go last, in their original order) and double-quotes the values SCHEMA.md
 * asks to quote. Comments stay with what they were written above, and a header stays at the top;
 * inline-comment alignment, flow-collection padding and folded scalars are normalized. Throws instead
 * of writing a result whose data differs from the input.
 */
export function fixText(text: string, kind: FileKind): FixResult {
  const parsed = parseYaml(text);
  if (parsed.errors.length > 0) return { text, changed: false };
  const { doc, lineCounter } = parsed;
  const lines = text.split(/\r?\n/);

  for (const { map, path, keys } of orderedMaps(doc, kind)) {
    const first = map.items[0];
    if (first === undefined || !isNode(first.key)) {
      sortMap(map, keys);
      continue;
    }
    if (path.length === 0) {
      // A comment right above the first top-level key is the file's header: keep it at the top.
      const header = first.key.commentBefore;
      sortMap(map, keys);
      const next = map.items[0];
      if (header && next !== undefined && next !== first && isNode(next.key)) {
        first.key.commentBefore = null;
        next.key.commentBefore = next.key.commentBefore ? `${header}\n${next.key.commentBefore}` : header;
      }
      continue;
    }
    // yaml stores a comment on its own line right above a nested map's first key on the map. Move it to
    // that key so it travels with it. A comment above a list item, or on the parent key's own line, is
    // the item's or the map's, and stays put.
    const keyLine = lineOf(first.key, lineCounter);
    const above = keyLine === undefined ? undefined : lines[keyLine - 2]?.trim();
    if (map.commentBefore && typeof path.at(-1) === "string" && above?.startsWith("#")) {
      first.key.commentBefore = first.key.commentBefore ? `${map.commentBefore}\n${first.key.commentBefore}` : map.commentBefore;
      map.commentBefore = null;
    }
    sortMap(map, keys);
  }
  for (const target of quoteTargets(doc, kind)) target.scalar.type = Scalar.QUOTE_DOUBLE;

  let output: string;
  try {
    output = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  } catch (error) {
    throw new Error(`not fixed: reordering breaks this file's YAML (${(error as Error).message}); reorder it by hand`);
  }
  if (output === text) return { text, changed: false };
  const check = parseYaml(output);
  if (check.errors.length > 0 || !isDeepStrictEqual(check.data, parsed.data)) {
    throw new Error("not fixed: reordering would change this file's data (anchors reused out of order?); reorder it by hand");
  }
  return { text: output, changed: true };
}
