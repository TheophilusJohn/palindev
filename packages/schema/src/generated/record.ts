// Generated from record.schema.json by scripts/generate-types.ts. Don't edit by hand:
// change the schema and run `pnpm --filter @palindev/schema generate`.

/**
 * One vendor API action: whether and how it can be undone, for how long, and what escapes first. Defined in docs/SCHEMA.md; rules V1 to V24 add the checks JSON Schema can't express. format keywords are annotations: rule V15 checks URLs, dates and durations.
 */
export type PalinRecord = {
  id: RecordId;
  provider: ProviderId;
  title: string;
  summary?: string;
  operation: Operation;
  api_version?: string;
  mcp_tool_aliases?: McpToolAlias[];
  cli_aliases?: CliAlias[];
  class: ReversibilityClass;
  flags?: Flags;
  undo?: Undo;
  residue?: ResidueItem[];
  suggested_annotations?: SuggestedAnnotations;
  recommended_policy?: Policy;
  approval_text?: string;
  variants?: Variant[];
  confidence: Confidence;
  /**
   * @minItems 1
   */
  evidence: [Evidence, ...Evidence[]];
  last_verified?: string;
  related?: RecordId[];
  notes?: string;
};
/**
 * <provider>.<resource>.<verb>: lowercase parts of a-z, 0-9 and _, separated by dots
 */
export type RecordId = string;
/**
 * Lowercase a-z, 0-9 and _; equals the provider's directory under data/
 */
export type ProviderId = string;
/**
 * One value, or a non-empty list meaning any of them
 */
export type MatchValue = Scalar | [Scalar, ...Scalar[]];
export type Scalar = string | number | boolean;
export type ReversibilityClass = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
/**
 * A JSON path in the action's response (such as id), or a value read before the call
 */
export type CaptureItem = string | CaptureBefore;
export type Policy = "allow" | "allow_and_log" | "confirm" | "confirm_strong" | "block";
/**
 * A whole undo object, as a variant's undo must be
 */
export type CompleteUndo = Undo;
export type Confidence = "tested" | "documented" | "community" | "draft";
export type Evidence = DocEvidence | SandboxRunEvidence | CommunityEvidence | VendorStatementEvidence | TodoEvidence;
/**
 * A record field path such as undo.window or variants[0].residue
 */
export type FieldPath = string;
/**
 * The fields this evidence item supports
 */
export type Supports = FieldPath[];

/**
 * http: method and path template; graphql: path is the root field name; rpc: path is the method name
 */
export interface Operation {
  kind: "http" | "graphql" | "rpc";
  /**
   * Lowercase service name such as s3 or dynamodb; required when provider is aws
   */
  service?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}
export interface McpToolAlias {
  server: string;
  tool: string;
  match?: ArgMatch;
  operation_from_args?: OperationFromArgs;
}
/**
 * Names mapped to required values; all listed names must match
 */
export interface ArgMatch {
  [k: string]: MatchValue | undefined;
}
/**
 * The arguments of a generic tool that hold the HTTP method and path
 */
export interface OperationFromArgs {
  method: string;
  path: string;
}
export interface CliAlias {
  command: string;
  match?: CliMatch;
}
/**
 * Flag names without dashes, or path for a positional path, mapped to required values
 */
export interface CliMatch {
  [k: string]: MatchValue | undefined;
}
export interface Flags {
  moves_money?: boolean;
  reaches_third_parties?: boolean;
  changes_permissions?: boolean;
  bulk?: boolean;
  modifies_existing?: boolean;
  needs_admin_scope?: boolean;
  idempotent?: "natural" | "key" | "no";
}
export interface Undo {
  method?: "inverse_call" | "restore" | "compensating_action" | "none" | "not_applicable";
  operation?: Operation | null;
  steps?: string[];
  window?: string | null;
  window_condition?: string | null;
  compensating_action?: string | null;
  capture?: CaptureItem[];
}
/**
 * A value read before the call: the read call and the JSON path in its response
 */
export interface CaptureBefore {
  before: Operation;
  field: string;
}
export interface ResidueItem {
  kind:
    | "notification"
    | "email"
    | "webhook"
    | "fee_retained"
    | "audit_log"
    | "third_party_copy"
    | "lost_state"
    | "cache"
    | "other";
  audience: "actor" | "workspace" | "external" | "vendor";
  when?: string;
  note: string;
  observed_by?: "probe" | "proxy" | "doc";
}
export interface SuggestedAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}
/**
 * Behaviour under specific arguments, settings or plans. Absent keys inherit from the top level; an explicit null clears
 */
export interface Variant {
  when: VariantWhen;
  class?: ReversibilityClass;
  flags?: Flags;
  undo?: CompleteUndo;
  residue?: ResidueItem[];
  suggested_annotations?: SuggestedAnnotations;
  recommended_policy?: Policy;
  approval_text?: string | null;
  notes?: string | null;
}
/**
 * All listed conditions must hold; a list of values means any of them
 */
export interface VariantWhen {
  args?: ArgMatch;
  settings?: ArgMatch;
  plan?: string | [string, ...string[]];
}
export interface DocEvidence {
  type: "doc";
  url: string;
  quote: string;
  retrieved: string;
  supports?: Supports;
}
export interface SandboxRunEvidence {
  type: "sandbox_run";
  run_id: string;
  date: string;
  environment: "test_mode" | "dev_workspace" | "test_account";
  result: "pass" | "fail" | "inconclusive";
  observed_class: ReversibilityClass;
  trace_sha256: string;
  trace_path: string;
  tested_on: TestedOn;
  vendor_paid: boolean;
  supports?: Supports;
}
/**
 * What a sandbox run was observed under
 */
export interface TestedOn {
  plan: string | null;
  /**
   * Non-default account settings that matter, by name
   */
  settings: {
    [k: string]: unknown | undefined;
  };
  variant: number | null;
}
export interface CommunityEvidence {
  type: "community";
  url: string;
  date: string;
  summary: string;
  supports?: Supports;
}
export interface VendorStatementEvidence {
  type: "vendor_statement";
  url: string;
  date: string;
  quote?: string;
  supports?: Supports;
}
/**
 * Missing evidence; only allowed while confidence is draft
 */
export interface TodoEvidence {
  type: "todo";
  field: FieldPath;
  note: string;
}
