// @palindev/schema: the JSON Schemas for Palin records and provider files, the types generated from
// them, and the offline validator (rules V1 to V22 and V24). See docs/SCHEMA.md.

export type * from "./generated/record.js";
export type { Consent, ProviderEvidence, ProviderFile, Sandbox, Terms } from "./generated/provider.js";
export { fixText, type FixResult } from "./fix.js";
export {
  FILE_PATH,
  RULE_IDS,
  displayPath,
  formatProblem,
  sortProblems,
  type Issue,
  type Problem,
  type ProblemRule,
  type RuleId,
  type Severity,
} from "./problems.js";
export { checkSchema, createAjv, providerSchema, recordSchema } from "./schema-check.js";
export { redactSecrets } from "./secrets.js";
export { validateRecord, validateRepo, type RecordProblem, type ValidateOptions, type ValidateResult } from "./validate.js";
