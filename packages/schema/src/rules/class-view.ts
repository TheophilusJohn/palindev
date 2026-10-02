import type { PalinRecord, Variant } from "../generated/record.js";
import type { Issue } from "../problems.js";

/** The fields rules V7 to V14 read. In drafts any of them may be absent, and the rules skip what is. */
export type ClassView = Pick<
  PalinRecord,
  "class" | "flags" | "undo" | "residue" | "suggested_annotations" | "recommended_policy"
>;

export type ClassRule = (view: ClassView) => Issue[];

export function classView(record: PalinRecord): ClassView {
  return {
    class: record.class,
    flags: record.flags,
    undo: record.undo,
    residue: record.residue,
    suggested_annotations: record.suggested_annotations,
    recommended_policy: record.recommended_policy,
  };
}

/**
 * A variant merged over the top level (SCHEMA.md "variants"): absent keys inherit, `flags` and
 * `suggested_annotations` merge key by key, and `residue` and `undo` replace the top level wholesale.
 */
export function mergeVariant(record: PalinRecord, variant: Variant): ClassView {
  const merge = <T extends object>(top: T | undefined, own: T | undefined): T | undefined =>
    top === undefined && own === undefined ? undefined : ({ ...top, ...own } as T);
  return {
    class: variant.class ?? record.class,
    flags: merge(record.flags, variant.flags),
    undo: variant.undo ?? record.undo,
    residue: variant.residue ?? record.residue,
    suggested_annotations: merge(record.suggested_annotations, variant.suggested_annotations),
    recommended_policy: variant.recommended_policy ?? record.recommended_policy,
  };
}
