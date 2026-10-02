import type { Issue } from "../problems.js";

function field(data: unknown, key: string): unknown {
  return data !== null && typeof data === "object" ? (data as Record<string, unknown>)[key] : undefined;
}

/**
 * V1 for a record: `id` equals `<directory>.<file stem>` and `provider` equals the directory.
 * Runs even when the schema fails, so it takes the raw data. (Misplaced files are reported by the loader.)
 */
export function v1Record(data: unknown, providerDir: string, stem: string): Issue[] {
  const issues: Issue[] = [];
  const expected = `${providerDir}.${stem}`;
  const id = field(data, "id");
  if (typeof id === "string" && id !== expected) {
    issues.push({ path: "id", message: `must be ${expected}, from the file's directory and name` });
  }
  const provider = field(data, "provider");
  if (typeof provider === "string" && provider !== providerDir) {
    issues.push({ path: "provider", message: `must be ${providerDir}, the record's directory` });
  }
  return issues;
}

/** V1 for `_provider.yaml`: `id` equals the directory. */
export function v1Provider(data: unknown, providerDir: string): Issue[] {
  const id = field(data, "id");
  return typeof id === "string" && id !== providerDir
    ? [{ path: "id", message: `must be ${providerDir}, the provider's directory` }]
    : [];
}
