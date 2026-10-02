import { isIsoDate } from "../formats.js";
import { isDraft, type RecordRule } from "./context.js";

/** V6: `last_verified` is required unless draft, forbidden on drafts, and not after `now`. */
export const v6: RecordRule = (record, { now }) => {
  const value = record.last_verified;
  if (isDraft(record)) {
    return value === undefined ? [] : [{ path: "last_verified", message: "drafts have no last_verified; it's set when the record is promoted" }];
  }
  if (value === undefined) {
    return [{ path: "last_verified", message: `required unless confidence is draft (${record.confidence} records carry it)` }];
  }
  // A malformed date is V15's to report.
  if (isIsoDate(value) && value > now) {
    return [{ path: "last_verified", message: `is after today (${now})` }];
  }
  return [];
};
