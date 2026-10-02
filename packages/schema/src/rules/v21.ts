import type { ResidueItem } from "../generated/record.js";
import type { Issue } from "../problems.js";
import { isDraft, type RecordRule } from "./context.js";

/**
 * V21: every residue item on a non-draft record, variants included, has `observed_by`; `probe` and
 * `proxy` need a passing sandbox_run on the record.
 */
export const v21: RecordRule = (record) => {
  const draft = isDraft(record);
  const passingRun = record.evidence.some((item) => item.type === "sandbox_run" && item.result === "pass");
  const issues: Issue[] = [];
  const check = (residue: readonly ResidueItem[] | undefined, prefix: string) => {
    residue?.forEach((item, index) => {
      const path = `${prefix}residue[${index}].observed_by`;
      if (item.observed_by === undefined) {
        if (!draft) issues.push({ path, message: "missing; say how this item is known (doc when it comes only from docs)" });
      } else if (item.observed_by !== "doc" && !passingRun) {
        issues.push({ path, message: `${item.observed_by} needs a passing sandbox_run on the record; until then the item is doc` });
      }
    });
  };
  check(record.residue, "");
  record.variants?.forEach((variant, index) => check(variant.residue, `variants[${index}].`));
  return issues;
};
