import type { ProviderFile } from "../generated/provider.js";
import type { PalinRecord, Policy, ReversibilityClass } from "../generated/record.js";
import type { Issue } from "../problems.js";

/** What a record rule may need besides the record itself. */
export interface RecordRuleContext {
  /** Today for the validator, YYYY-MM-DD in UTC (injectable for tests). */
  now: string;
  /** The record's provider file, when it exists and passes the provider schema. */
  provider?: ProviderFile | undefined;
}

/** A rule that checks one schema-valid record. */
export type RecordRule = (record: PalinRecord, context: RecordRuleContext) => Issue[];

export const CLASS_ORDER: readonly ReversibilityClass[] = ["R0", "R1", "R2", "R3", "R4", "R5"];
export const POLICY_ORDER: readonly Policy[] = ["allow", "allow_and_log", "confirm", "confirm_strong", "block"];

/** R5 is the strictest class. */
export function classRank(value: ReversibilityClass): number {
  return CLASS_ORDER.indexOf(value);
}

/** block is the strictest policy. */
export function policyRank(value: Policy): number {
  return POLICY_ORDER.indexOf(value);
}

/** R3 to R5: an approval prompt has to say what escapes (V22). */
export function needsApprovalText(value: ReversibilityClass): boolean {
  return classRank(value) >= classRank("R3");
}

export function isDraft(record: PalinRecord): boolean {
  return record.confidence === "draft";
}

export function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
