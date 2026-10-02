import type { ReversibilityClass, Undo } from "../generated/record.js";
import { classView, type ClassRule } from "./class-view.js";
import type { RecordRule } from "./context.js";

type Method = NonNullable<Undo["method"]>;

const ALLOWED: Readonly<Record<ReversibilityClass, readonly Method[]>> = {
  R0: ["not_applicable"],
  R1: ["inverse_call", "restore", "compensating_action", "none"],
  R2: ["inverse_call", "restore"],
  R3: ["inverse_call", "restore"],
  R4: ["inverse_call", "restore"],
  R5: ["none", "compensating_action"],
};

/** V11: the undo method each class allows. */
export const v11Class: ClassRule = (view) => {
  const method = view.undo?.method;
  if (method === undefined) return [];
  const allowed = ALLOWED[view.class];
  return allowed.includes(method)
    ? []
    : [{ path: "undo.method", message: `${view.class} allows ${allowed.join(" or ")}, not ${method}` }];
};

export const v11: RecordRule = (record) => v11Class(classView(record));
