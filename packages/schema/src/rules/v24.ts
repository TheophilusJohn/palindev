import type { RecordRule } from "./context.js";

/**
 * V24: `tested` needs the provider's `terms.status: green` or a filled `terms.consent` (D13).
 * Skipped when the provider file is missing or invalid, which V2 reports.
 */
export const v24: RecordRule = (record, { provider }) => {
  if (record.confidence !== "tested" || provider === undefined) return [];
  const { status, consent } = provider.terms;
  const consentFilled = consent !== null && consent.date !== "" && consent.from !== "" && consent.reference !== "";
  if (status === "green" || consentFilled) return [];
  return [
    {
      path: "confidence",
      message: `tested needs the provider's terms.status to be green or a filled terms.consent (D13); ${provider.id} is ${status}, so keep this record below tested`,
    },
  ];
};
