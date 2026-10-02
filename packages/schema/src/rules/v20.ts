import type { PalinRecord, Variant } from "../generated/record.js";
import { parsePath } from "../paths.js";
import type { Issue, RuleId } from "../problems.js";
import { classView, mergeVariant, type ClassRule } from "./class-view.js";
import { classRank, hasOwn, policyRank, type RecordRule } from "./context.js";
import { v7Class } from "./v7.js";
import { v8Class } from "./v8.js";
import { v9Class } from "./v9.js";
import { v10Class } from "./v10.js";
import { v11Class } from "./v11.js";
import { v12Class } from "./v12.js";
import { v13Class } from "./v13.js";
import { v14Class } from "./v14.js";

/** V7 to V14, which V20 reruns on each variant merged over the top level. */
export const CLASS_RULES: ReadonlyArray<readonly [RuleId, ClassRule]> = [
  ["V7", v7Class],
  ["V8", v8Class],
  ["V9", v9Class],
  ["V10", v10Class],
  ["V11", v11Class],
  ["V12", v12Class],
  ["V13", v13Class],
  ["V14", v14Class],
];

/** Whether the variant itself sets the value at a merged path (so it isn't inherited). */
function variantSets(variant: Variant, path: string): boolean {
  const [field, key] = parsePath(path);
  if (typeof field !== "string" || !hasOwn(variant, field)) return false;
  if ((field === "flags" || field === "suggested_annotations") && typeof key === "string") {
    const own = variant[field];
    return own !== undefined && hasOwn(own, key);
  }
  return true;
}

/**
 * V20: each variant merged over the top level passes V7 to V14, and the top-level `class` and
 * `recommended_policy` are at least as strict as every variant's. A problem the top level already
 * reports, in a value the variant inherits, isn't repeated here.
 */
export const v20: RecordRule = (record: PalinRecord) => {
  const variants = record.variants ?? [];
  if (variants.length === 0) return [];
  const top = classView(record);
  const topIssues = new Set(
    CLASS_RULES.flatMap(([rule, check]) => check(top).map((issue) => `${rule}\u0000${issue.path}\u0000${issue.message}`)),
  );
  const issues: Issue[] = [];
  variants.forEach((variant, index) => {
    const at = `variants[${index}]`;
    const merged = mergeVariant(record, variant);
    for (const [rule, check] of CLASS_RULES) {
      for (const issue of check(merged)) {
        const repeated = topIssues.has(`${rule}\u0000${issue.path}\u0000${issue.message}`);
        if (repeated && !variantSets(variant, issue.path)) continue;
        issues.push({ path: `${at}.${issue.path}`, message: `merged over the top level, this variant fails ${rule}: ${issue.message}` });
      }
    }
    if (variant.class !== undefined && classRank(variant.class) > classRank(record.class)) {
      issues.push({
        path: `${at}.class`,
        message: `${variant.class} is stricter than the top-level ${record.class}; the top level describes the default call, so its class is at least every variant's`,
      });
    }
    const topPolicy = record.recommended_policy;
    if (variant.recommended_policy !== undefined && topPolicy !== undefined && policyRank(variant.recommended_policy) > policyRank(topPolicy)) {
      issues.push({
        path: `${at}.recommended_policy`,
        message: `${variant.recommended_policy} is stricter than the top-level ${topPolicy}; the top-level policy is at least every variant's`,
      });
    }
  });
  return issues;
};
