import type { Issue } from "../problems.js";
import { classView, type ClassRule } from "./class-view.js";
import type { RecordRule } from "./context.js";

const R0_FALSE_FLAGS = ["moves_money", "reaches_third_parties", "changes_permissions", "bulk", "modifies_existing"] as const;

/**
 * V7: R0 has `undo.method: not_applicable`, empty residue and five flags false; R1 has
 * `modifies_existing: false`. (V11 also checks R0's method, as SCHEMA.md lists it under both.)
 */
export const v7Class: ClassRule = (view) => {
  const issues: Issue[] = [];
  if (view.class === "R0") {
    const method = view.undo?.method;
    if (method !== undefined && method !== "not_applicable") {
      issues.push({ path: "undo.method", message: `R0 records use not_applicable, not ${method}` });
    }
    if (view.residue !== undefined && view.residue.length > 0) {
      issues.push({ path: "residue", message: "R0 records have no residue; anything that escapes means the call changes state" });
    }
    for (const flag of R0_FALSE_FLAGS) {
      if (view.flags?.[flag] === true) issues.push({ path: `flags.${flag}`, message: "is false on every R0 record" });
    }
  }
  if (view.class === "R1" && view.flags?.modifies_existing === true) {
    issues.push({
      path: "flags.modifies_existing",
      message: "is false on R1 records: minor metadata such as read markers doesn't count",
    });
  }
  return issues;
};

export const v7: RecordRule = (record) => v7Class(classView(record));
