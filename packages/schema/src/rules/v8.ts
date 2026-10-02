import type { Issue } from "../problems.js";
import { classView, type ClassRule } from "./class-view.js";
import type { RecordRule } from "./context.js";

/** V8: R2 residue reaches only the actor or the vendor, and is never fee_retained or lost_state. */
export const v8Class: ClassRule = (view) => {
  if (view.class !== "R2" || view.residue === undefined) return [];
  const issues: Issue[] = [];
  view.residue.forEach((item, index) => {
    if (item.audience === "workspace" || item.audience === "external") {
      issues.push({
        path: `residue[${index}].audience`,
        message: `R2 residue reaches only the actor or the vendor; ${item.audience} residue makes the class R3 or stricter`,
      });
    }
    if (item.kind === "fee_retained" || item.kind === "lost_state") {
      issues.push({
        path: `residue[${index}].kind`,
        message: `R2 has no ${item.kind} residue; something the undo can't take back makes the class R3 or stricter`,
      });
    }
  });
  return issues;
};

export const v8: RecordRule = (record) => v8Class(classView(record));
