import type { SuggestedAnnotations } from "../generated/record.js";
import type { Issue } from "../problems.js";
import { classView, type ClassRule, type ClassView } from "./class-view.js";
import type { RecordRule } from "./context.js";

type Hint = keyof SuggestedAnnotations;
/** The expected value of a hint and why, or undefined when it depends on a flag that's absent. */
export type ExpectedHint = { value: boolean; why: string } | undefined;

const HINTS: readonly Hint[] = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];

/** The MCP annotation mapping in SCHEMA.md. */
export function expectedAnnotations(view: ClassView): Record<Hint, ExpectedHint> {
  const { class: cls, flags } = view;

  let destructiveHint: ExpectedHint;
  if (cls === "R0" || cls === "R1") destructiveHint = { value: false, why: `${cls} sets destructiveHint: false` };
  else if (cls === "R2") {
    const modifies = flags?.modifies_existing;
    destructiveHint =
      modifies === undefined ? undefined : { value: modifies, why: `R2 sets destructiveHint to flags.modifies_existing (${modifies})` };
  } else destructiveHint = { value: true, why: `${cls} sets destructiveHint: true` };

  const idempotent = flags?.idempotent;
  let idempotentHint: ExpectedHint;
  if (cls === "R0") idempotentHint = { value: true, why: "R0 sets idempotentHint: true" };
  else if (idempotent !== undefined) {
    idempotentHint = {
      value: idempotent === "natural",
      why: `idempotentHint is true only when flags.idempotent is natural (here it is ${idempotent})`,
    };
  }

  return {
    readOnlyHint: { value: cls === "R0", why: cls === "R0" ? "R0 sets readOnlyHint: true" : "only R0 sets readOnlyHint: true" },
    destructiveHint,
    idempotentHint,
    openWorldHint: { value: true, why: "openWorldHint is always true: every record describes an external SaaS call" },
  };
}

/** V13: `suggested_annotations` match the class and flags (SCHEMA.md "MCP annotation mapping"). */
export const v13Class: ClassRule = (view) => {
  const actual = view.suggested_annotations;
  if (actual === undefined) return [];
  const expected = expectedAnnotations(view);
  const issues: Issue[] = [];
  for (const hint of HINTS) {
    const want = expected[hint];
    const have = actual[hint];
    if (want !== undefined && have !== undefined && have !== want.value) {
      issues.push({ path: `suggested_annotations.${hint}`, message: `must be ${want.value}: ${want.why}` });
    }
  }
  return issues;
};

export const v13: RecordRule = (record) => v13Class(classView(record));
