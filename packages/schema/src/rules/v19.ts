import type { PalinRecord } from "../generated/record.js";
import { FLAG_KEYS, HINT_KEYS, UNDO_KEYS } from "../order.js";
import type { Issue } from "../problems.js";
import { hasOwn, isDraft, needsApprovalText, type RecordRule } from "./context.js";

const NON_DRAFT_FIELDS = [
  "summary",
  "api_version",
  "flags",
  "undo",
  "residue",
  "suggested_annotations",
  "recommended_policy",
] as const;

/**
 * The fields a non-draft must have that this record leaves out, except `last_verified`: top-level
 * fields (`approval_text` on R3 to R5), sub-keys of a present `flags`, `undo` or
 * `suggested_annotations`, residue `observed_by` (V21), and a variant's `approval_text` where V22
 * requires one.
 */
export function missingForPromotion(record: PalinRecord): string[] {
  const missing: string[] = [];
  for (const field of NON_DRAFT_FIELDS) if (record[field] === undefined) missing.push(field);
  if (needsApprovalText(record.class) && record.approval_text === undefined) missing.push("approval_text");

  const subKeys = (object: object | undefined, name: string, keys: readonly string[]) => {
    if (object !== undefined) for (const key of keys) if (!hasOwn(object, key)) missing.push(`${name}.${key}`);
  };
  subKeys(record.flags, "flags", FLAG_KEYS);
  subKeys(record.undo, "undo", UNDO_KEYS);
  subKeys(record.suggested_annotations, "suggested_annotations", HINT_KEYS);

  record.residue?.forEach((item, index) => {
    if (item.observed_by === undefined) missing.push(`residue[${index}].observed_by`);
  });
  record.variants?.forEach((variant, index) => {
    variant.residue?.forEach((item, itemIndex) => {
      if (item.observed_by === undefined) missing.push(`variants[${index}].residue[${itemIndex}].observed_by`);
    });
    if (variant.class === undefined || hasOwn(variant, "approval_text")) return;
    if (needsApprovalText(variant.class) || needsApprovalText(record.class)) missing.push(`variants[${index}].approval_text`);
  });
  return missing;
}

/** V19: in a draft, every field a non-draft must have that is missing is named by a `todo` item. */
export const v19: RecordRule = (record) => {
  if (!isDraft(record)) return [];
  const named = new Set(record.evidence.flatMap((item) => (item.type === "todo" ? [item.field] : [])));
  const issues: Issue[] = [];
  for (const field of missingForPromotion(record)) {
    if (!named.has(field)) {
      issues.push({ path: field, message: `missing from this draft and not named by a todo item; add it, or a todo with field: ${field}` });
    }
  }
  return issues;
};
