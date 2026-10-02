import type { Issue } from "../problems.js";
import { hasOwn, isDraft, needsApprovalText, type RecordRule } from "./context.js";

const MAX_LENGTH = 120;

function tooLong(text: string): number | undefined {
  const length = [...text].length;
  return length > MAX_LENGTH ? length : undefined;
}

/**
 * V22: `approval_text` is at most 120 characters and required on non-draft R3 to R5 records. A variant
 * that sets R3 to R5 sets its own non-null text; one that sets R0 to R2 on an R3 to R5 record sets
 * `approval_text: null`, because an absent key would inherit the top-level text; one that doesn't set
 * `class` on an R3 to R5 record doesn't set it to null. Drafts skip absent keys.
 */
export const v22: RecordRule = (record) => {
  const draft = isDraft(record);
  const issues: Issue[] = [];
  const length = (path: string, text: string | null | undefined) => {
    const over = typeof text === "string" ? tooLong(text) : undefined;
    if (over !== undefined) issues.push({ path, message: `is ${over} characters; approval text is ${MAX_LENGTH} or fewer` });
  };

  length("approval_text", record.approval_text);
  if (!draft && needsApprovalText(record.class) && record.approval_text === undefined) {
    issues.push({ path: "approval_text", message: `required on ${record.class}: say what escapes and whether it can be undone, in ${MAX_LENGTH} characters or fewer` });
  }

  record.variants?.forEach((variant, index) => {
    const path = `variants[${index}].approval_text`;
    const present = hasOwn(variant, "approval_text");
    length(path, variant.approval_text);
    if (variant.class === undefined) {
      // The variant inherits the class, so on an R3 to R5 record a null would leave an R3 to R5 call
      // without approval text.
      if (needsApprovalText(record.class) && present && variant.approval_text === null) {
        issues.push({ path, message: `this variant inherits ${record.class}, which needs approval text; leave the key out to keep the top-level text, or write its own` });
      }
      return;
    }
    if (needsApprovalText(variant.class)) {
      if (present ? variant.approval_text === null : !draft) {
        issues.push({ path, message: `a variant that sets ${variant.class} has its own approval_text; the top-level text describes the default call` });
      }
    } else if (needsApprovalText(record.class)) {
      if (present ? variant.approval_text !== null : !draft) {
        issues.push({ path, message: `a variant that sets ${variant.class} on an ${record.class} record sets approval_text: null, or it inherits the top-level text` });
      }
    }
  });
  return issues;
};
