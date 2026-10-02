import type { ErrorObject, ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import providerSchema from "../provider.schema.json" with { type: "json" };
import recordSchema from "../record.schema.json" with { type: "json" };
import type { FileKind } from "./load.js";
import { formatPath, pointerToSegments, type PathSegment } from "./paths.js";
import { FILE_PATH, type Issue } from "./problems.js";

export { providerSchema, recordSchema };

/** The Ajv instance the validator and the tests use. */
export function createAjv(): Ajv2020 {
  return new Ajv2020({
    allErrors: true,
    strict: true,
    // The non-draft fields, aws `service` and http `method` are conditional `required` inside
    // if/then/else, which strictRequired rejects at compile time.
    strictRequired: false,
    strictTypes: false,
    discriminator: true,
    // `format` keywords are annotations; V15 checks URLs, dates and durations (one owner per check).
    validateFormats: false,
    // Adds the offending value to each error, for messages such as "quote it".
    verbose: true,
  });
}

let validators: Record<FileKind, ValidateFunction> | undefined;

function getValidators(): Record<FileKind, ValidateFunction> {
  if (validators === undefined) {
    const ajv = createAjv();
    validators = { record: ajv.compile(recordSchema), provider: ajv.compile(providerSchema) };
  }
  return validators;
}

/** JSON Schema problems in parsed YAML data, as plain-language issues (rule id `schema`). */
export function checkSchema(kind: FileKind, data: unknown): Issue[] {
  const validate = getValidators()[kind];
  if (validate(data)) return [];
  const issues = describeErrors(validate.errors ?? [], kind);
  // Never report a file that fails the schema as clean, even if no error could be described.
  return issues.length > 0 ? issues : [{ path: FILE_PATH, message: "doesn't match the schema" }];
}

const TYPE_NAMES: Record<string, string> = {
  string: "a string",
  number: "a number",
  integer: "a whole number",
  boolean: "true or false",
  object: "a mapping",
  array: "a list",
  null: "null",
};

function typeNames(type: unknown): string[] {
  const types = Array.isArray(type) ? type.map(String) : String(type).split(",");
  return types.map((name) => TYPE_NAMES[name] ?? name);
}

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function isWrapper(error: ErrorObject): boolean {
  return error.keyword === "anyOf" || error.keyword === "oneOf" || error.keyword === "if";
}

function under(error: ErrorObject, path: string): boolean {
  return error.instancePath === path || error.instancePath.startsWith(`${path}/`);
}

const PATTERN_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["/recordId/", "must be <provider>.<resource>.<verb>: lowercase parts of a-z, 0-9 and _, separated by dots"],
  ["/providerId/", "must use only lowercase a-z, 0-9 and _"],
  ["/fieldPath/", "must be a field path such as undo.window or variants[0].residue"],
  ["/trace_sha256/", "must be 64 lowercase hexadecimal characters"],
  ["/trace_path/", "must be runs/YYYY/MM/<run_id>.json"],
  ["/service/", "must be a lowercase service name such as s3 or dynamodb"],
];

function describe(error: ErrorObject, kind: FileKind): Issue {
  const segments: PathSegment[] = pointerToSegments(error.instancePath);
  const params = error.params as Record<string, unknown>;
  const at = (extra: PathSegment[] = []) => formatPath([...segments, ...extra]);

  switch (error.keyword) {
    case "required": {
      const key = String(params.missingProperty);
      let message = `missing \`${key}\``;
      if (error.schemaPath.includes("/nonDraftRequirements/")) message += " (required unless confidence is draft)";
      else if (error.schemaPath.includes("/awsOperation/")) message = "missing `service`: every aws operation names its service";
      else if (error.schemaPath.includes("/operation/then/")) message = "missing `method`: http operations name their method";
      else if (/^\/variants\/\d+\/undo$/.test(error.instancePath)) message += " (a variant's undo is a complete undo object)";
      return { path: at([key]), message };
    }
    case "additionalProperties": {
      const key = String(params.additionalProperty);
      return { path: at([key]), message: "isn't a field here; see docs/SCHEMA.md for the fields allowed" };
    }
    case "enum":
      return { path: at(), message: `must be one of: ${(params.allowedValues as unknown[]).map(String).join(", ")}` };
    case "const":
      return { path: at(), message: `must be ${JSON.stringify(params.allowedValue)}` };
    case "type": {
      const expected = typeNames(params.type);
      const quote =
        expected.includes("a string") && (typeof error.data === "number" || typeof error.data === "boolean")
          ? "; quote the value so it stays a string"
          : "";
      if (segments.length === 0) return { path: at(), message: "the file must hold one YAML mapping" };
      return { path: at(), message: `must be ${joinOr(expected)}${quote}` };
    }
    case "pattern": {
      const known = PATTERN_MESSAGES.find(([fragment]) => error.schemaPath.includes(fragment));
      return { path: at(), message: known?.[1] ?? `must match ${String(params.pattern)}` };
    }
    case "minLength":
      return { path: at(), message: "can't be empty" };
    case "minItems":
      return { path: at(), message: `needs at least ${String(params.limit)} item${params.limit === 1 ? "" : "s"}` };
    case "minProperties":
      return { path: at(), message: "needs at least one key" };
    case "minimum":
      return { path: at(), message: `must be at least ${String(params.limit)}` };
    case "false schema": {
      const last = segments[segments.length - 1];
      if (last === "method") return { path: at(), message: "only http operations have a method" };
      if (last === "operation_from_args") return { path: at(), message: "an alias has match or operation_from_args, not both" };
      return { path: at(), message: "isn't allowed here" };
    }
    case "discriminator": {
      const types = kind === "provider" ? "doc or vendor_statement" : "doc, sandbox_run, community, vendor_statement or todo";
      return { path: at(["type"]), message: `must be ${types}` };
    }
    case "propertyNames":
      return {
        path: at([String(params.propertyName)]),
        message: "flag names in a CLI match are written without dashes",
      };
    default:
      return { path: at(), message: error.message ?? "is invalid" };
  }
}

/** Turns Ajv errors into one plain message per real problem, dropping the noise around anyOf and if. */
export function describeErrors(errors: readonly ErrorObject[], kind: FileKind): Issue[] {
  const drop = new Set<ErrorObject>();
  const issues: Issue[] = [];

  // Operations whose `kind` is missing or wrong: their method errors follow from that, so only the
  // kind is reported.
  const badKind = new Set<string>();
  for (const error of errors) {
    const params = error.params as { missingProperty?: string };
    if (error.keyword === "required" && params.missingProperty === "kind") badKind.add(error.instancePath);
    else if (error.instancePath.endsWith("/kind")) badKind.add(error.instancePath.slice(0, -"/kind".length));
  }

  for (const error of errors) {
    const params = error.params as { error?: string; tagValue?: unknown; missingProperty?: string };
    // Errors inside propertyNames repeat the propertyNames error itself.
    if (error.propertyName !== undefined) drop.add(error);
    // A missing `type` on an evidence item already reports as `required`; a non-string one doesn't.
    if (error.keyword === "discriminator" && params.error === "tag" && params.tagValue === undefined) drop.add(error);
    if (error.keyword === "false schema" && badKind.has(error.instancePath.replace(/\/method$/, "")) && error.instancePath.endsWith("/method")) drop.add(error);
    if (error.keyword === "required" && params.missingProperty === "method" && badKind.has(error.instancePath)) drop.add(error);
  }

  for (const error of errors) {
    if (!isWrapper(error)) continue;
    drop.add(error);
    if (error.keyword === "if") continue;
    // For anyOf/oneOf, keep what the matching branch says; when every branch fails on type alone,
    // say which types are allowed.
    const branchErrors = errors.filter((other) => other !== error && !drop.has(other) && under(other, error.instancePath));
    const typeErrors = branchErrors.filter((other) => other.keyword === "type" && other.instancePath === error.instancePath);
    const meaningful = branchErrors.filter((other) => !typeErrors.includes(other) && !isWrapper(other));
    for (const typeError of typeErrors) drop.add(typeError);
    if (meaningful.length === 0 && typeErrors.length > 0) {
      const expected = [...new Set(typeErrors.flatMap((typeError) => typeNames(typeError.params.type)))];
      issues.push({ path: formatPath(pointerToSegments(error.instancePath)), message: `must be ${joinOr(expected)}` });
    }
  }

  for (const error of errors) if (!drop.has(error)) issues.push(describe(error, kind));

  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
