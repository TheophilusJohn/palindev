import type { Issue } from "../problems.js";

/** What the loader found for a record's provider directory. */
export interface ProviderState {
  /** `_provider.yaml` exists. */
  exists: boolean;
  /** It parses and passes the provider schema. */
  valid: boolean;
}

/** V2: `data/<provider>/_provider.yaml` exists and is valid. Reported on each record in the directory. */
export function v2(provider: ProviderState): Issue[] {
  if (!provider.exists) {
    return [{ path: "provider", message: "no _provider.yaml in this provider directory; add one from docs/templates/provider.yaml" }];
  }
  if (!provider.valid) {
    return [{ path: "provider", message: "this directory's _provider.yaml doesn't parse or doesn't pass the provider schema; its own problems are listed under it" }];
  }
  return [];
}
