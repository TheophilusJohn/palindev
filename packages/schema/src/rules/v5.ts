import type { Issue } from "../problems.js";
import { isDraft, type RecordRule } from "./context.js";

/** V5: `todo` evidence only while `confidence` is draft. */
export const v5: RecordRule = (record) => {
  if (isDraft(record)) return [];
  const issues: Issue[] = [];
  record.evidence.forEach((item, index) => {
    if (item.type === "todo") {
      issues.push({
        path: `evidence[${index}]`,
        message: `todo items are only allowed on drafts; find the evidence for ${item.field}, or move it to an "Open question:" line in notes`,
      });
    }
  });
  return issues;
};
