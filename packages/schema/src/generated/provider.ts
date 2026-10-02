// Generated from provider.schema.json by scripts/generate-types.ts. Don't edit by hand:
// change the schema and run `pnpm --filter @palindev/schema generate`.

/**
 * Lowercase a-z, 0-9 and _; equals the provider's directory under data/
 */
export type ProviderId = string;
/**
 * doc and vendor_statement items only, never todo
 */
export type ProviderEvidence = DocEvidence | VendorStatementEvidence;
/**
 * A record field path such as undo.window or variants[0].residue
 */
export type FieldPath = string;
/**
 * The fields this evidence item supports
 */
export type Supports = FieldPath[];

/**
 * A provider's data/<provider>/_provider.yaml: where its docs live, how it versions its API, its sandbox, and whether its terms let Palin test it and publish results (D13). Defined in docs/SCHEMA.md. Provider files have no draft state. format keywords are annotations: rule V15 checks URLs and dates.
 */
export interface ProviderFile {
  id: ProviderId;
  name: string;
  docs_url: string;
  api_reference_url: string;
  openapi_url: string | null;
  changelog_url: string;
  versioning: string;
  current_api_version: string;
  terms_url: string;
  terms: Terms;
  sandbox: Sandbox;
  /**
   * @minItems 1
   */
  evidence: [ProviderEvidence, ...ProviderEvidence[]];
  last_reviewed: string;
}
/**
 * May Palin test this provider and publish the results? (D13, rule V24)
 */
export interface Terms {
  status: "green" | "yellow" | "red";
  consent: Consent | null;
  notes: string;
}
/**
 * Written consent from the vendor; only the maintainer fills it in (D23)
 */
export interface Consent {
  date: string;
  from: string;
  reference: string;
}
export interface Sandbox {
  kind: "test_mode" | "dev_workspace" | "test_account" | "none";
  signup_url: string | null;
  cost: "free" | "paid" | "unknown";
  notes: string;
}
export interface DocEvidence {
  type: "doc";
  url: string;
  quote: string;
  retrieved: string;
  supports?: Supports;
}
export interface VendorStatementEvidence {
  type: "vendor_statement";
  url: string;
  date: string;
  quote?: string;
  supports?: Supports;
}
