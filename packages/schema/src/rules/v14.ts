import type { Policy, ReversibilityClass } from "../generated/record.js";
import { classView, type ClassRule, type ClassView } from "./class-view.js";
import { POLICY_ORDER, policyRank, type RecordRule } from "./context.js";

const CLASS_MINIMUM: Readonly<Record<ReversibilityClass, Policy>> = {
  R0: "allow",
  R1: "allow_and_log",
  R2: "allow_and_log",
  R3: "confirm",
  R4: "confirm",
  R5: "confirm_strong",
};

/** The minimum policy from the class and the flags present (SCHEMA.md "Policy scale"), with the reasons. */
export function minimumPolicy(view: ClassView): { policy: Policy; reasons: string[] } {
  let policy = CLASS_MINIMUM[view.class];
  const reasons: string[] = [view.class];
  const raisers = (["moves_money", "changes_permissions", "reaches_third_parties"] as const).filter(
    (flag) => view.flags?.[flag] === true,
  );
  if (raisers.length > 0) {
    if (policyRank(policy) < policyRank("confirm")) policy = "confirm";
    reasons.push(...raisers);
  }
  if (view.flags?.bulk === true) {
    // One step above whatever the minimum otherwise is, capped at confirm_strong; block is never computed.
    policy = POLICY_ORDER[Math.min(policyRank(policy) + 1, policyRank("confirm_strong"))] ?? policy;
    reasons.push("bulk");
  }
  return { policy, reasons };
}

/** V14: `recommended_policy` is at least the minimum from the class and flags. */
export const v14Class: ClassRule = (view) => {
  const actual = view.recommended_policy;
  if (actual === undefined) return [];
  const { policy, reasons } = minimumPolicy(view);
  return policyRank(actual) < policyRank(policy)
    ? [{ path: "recommended_policy", message: `${reasons.join(" + ")} needs at least ${policy}, not ${actual}` }]
    : [];
};

export const v14: RecordRule = (record) => v14Class(classView(record));
