import type { Issue } from "../problems.js";
import { classView, type ClassRule } from "./class-view.js";
import type { RecordRule } from "./context.js";

/** V10: R4 has `undo.window` or `undo.window_condition`; every other class has both null. */
export const v10Class: ClassRule = (view) => {
  const undo = view.undo;
  if (undo === undefined) return [];
  const { window, window_condition: condition } = undo;
  if (view.class === "R4") {
    return window === null && condition === null
      ? [{ path: "undo.window", message: "R4 needs a window (such as P30D) or a window_condition" }]
      : [];
  }
  const issues: Issue[] = [];
  if (window !== undefined && window !== null) {
    issues.push({ path: "undo.window", message: `only R4 has a window; use null on ${view.class}, or make the class R4` });
  }
  if (condition !== undefined && condition !== null) {
    issues.push({ path: "undo.window_condition", message: `only R4 has a window_condition; use null on ${view.class}, or make the class R4` });
  }
  return issues;
};

export const v10: RecordRule = (record) => v10Class(classView(record));
