import type { RecordRule } from "./context.js";

/** V4: `documented` needs a doc or vendor_statement item; `community` needs a community item. */
export const v4: RecordRule = (record) => {
  const has = (...types: string[]) => record.evidence.some((item) => types.includes(item.type));
  if (record.confidence === "documented" && !has("doc", "vendor_statement")) {
    return [{ path: "evidence", message: "documented needs at least one doc or vendor_statement item" }];
  }
  if (record.confidence === "community" && !has("community")) {
    return [{ path: "evidence", message: "community needs at least one community item" }];
  }
  return [];
};
