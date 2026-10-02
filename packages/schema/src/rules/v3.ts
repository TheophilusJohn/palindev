import type { RecordRule } from "./context.js";

/** V3: `tested` needs a passing sandbox run of the default call whose observed class equals `class`. */
export const v3: RecordRule = (record) => {
  if (record.confidence !== "tested") return [];
  const ok = record.evidence.some(
    (item) =>
      item.type === "sandbox_run" &&
      item.result === "pass" &&
      item.tested_on.variant === null &&
      item.observed_class === record.class,
  );
  return ok
    ? []
    : [
        {
          path: "confidence",
          message: `tested needs a sandbox_run with result: pass, tested_on.variant: null (the default call) and observed_class ${record.class}`,
        },
      ];
};
