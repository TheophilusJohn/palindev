import { classView, type ClassRule } from "./class-view.js";
import type { RecordRule } from "./context.js";

/** V9: R3 has residue that escapes (workspace or external) or is lost (fee_retained or lost_state). */
export const v9Class: ClassRule = (view) => {
  if (view.class !== "R3" || view.residue === undefined) return [];
  const escapes = view.residue.some(
    (item) =>
      item.audience === "workspace" ||
      item.audience === "external" ||
      item.kind === "fee_retained" ||
      item.kind === "lost_state",
  );
  return escapes
    ? []
    : [
        {
          path: "residue",
          message:
            "R3 needs a residue item with audience workspace or external, or of kind fee_retained or lost_state; without one the class is R2",
        },
      ];
};

export const v9: RecordRule = (record) => v9Class(classView(record));
