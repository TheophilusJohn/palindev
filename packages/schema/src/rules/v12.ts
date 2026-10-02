import { classView, type ClassRule } from "./class-view.js";
import type { RecordRule } from "./context.js";

/**
 * V12: inverse_call and restore have `undo.operation` or non-empty `undo.steps`; compensating_action
 * has `undo.compensating_action`; none and not_applicable have `undo.operation: null`.
 */
export const v12Class: ClassRule = (view) => {
  const undo = view.undo;
  if (undo?.method === undefined) return [];
  switch (undo.method) {
    case "inverse_call":
    case "restore":
      return undo.operation === null && undo.steps !== undefined && undo.steps.length === 0
        ? [{ path: "undo.operation", message: `${undo.method} needs the API call in undo.operation, or the UI or admin steps in undo.steps` }]
        : [];
    case "compensating_action":
      return undo.compensating_action === null
        ? [{ path: "undo.compensating_action", message: "describe the compensating action in one plain sentence; its API call, if any, goes in undo.operation" }]
        : [];
    case "none":
    case "not_applicable":
      return undo.operation !== undefined && undo.operation !== null
        ? [{ path: "undo.operation", message: `is null when the method is ${undo.method}` }]
        : [];
  }
};

export const v12: RecordRule = (record) => v12Class(classView(record));
