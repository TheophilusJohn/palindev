import type { Document } from "yaml";
import type { FileKind } from "../load.js";
import { firstOutOfOrder, orderedMaps, presentInOrder, quoteTargets } from "../order.js";
import { formatPath } from "../paths.js";
import type { Issue } from "../problems.js";

/**
 * V18 (warning): keys follow the documented order at every level (`supports` last in evidence), and
 * the values SCHEMA.md asks to quote are quoted. `pnpm validate --fix` fixes both.
 */
export function v18(doc: Document, kind: FileKind): Issue[] {
  const issues: Issue[] = [];
  for (const { map, path, keys } of orderedMaps(doc, kind)) {
    const wrong = firstOutOfOrder(map, keys);
    if (wrong !== undefined) {
      issues.push({
        path: formatPath([...path, wrong.key]),
        message: `\`${wrong.key}\` belongs before \`${wrong.after}\` (order: ${presentInOrder(map, keys).join(", ")}); pnpm validate --fix reorders keys`,
      });
    }
  }
  for (const target of quoteTargets(doc, kind)) {
    issues.push({ path: formatPath(target.path), message: `${target.message}; pnpm validate --fix quotes it` });
  }
  return issues;
}
