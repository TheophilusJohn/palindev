import type { ErrorObject } from "ajv";
import { describe, expect, it } from "vitest";
import { checkSchema, describeErrors } from "../src/schema-check.js";
import { base } from "./helpers.js";

function error(overrides: Partial<ErrorObject>): ErrorObject {
  return { keyword: "type", instancePath: "", schemaPath: "#/type", params: {}, ...overrides };
}

describe("checkSchema", () => {
  it("returns no issues for valid data", () => {
    expect(checkSchema("record", base.r0())).toEqual([]);
  });

  it("explains a file that isn't a mapping", () => {
    expect(checkSchema("record", ["a list"])).toEqual([{ path: "(file)", message: "the file must hold one YAML mapping" }]);
    expect(checkSchema("provider", null)).toEqual([{ path: "(file)", message: "the file must hold one YAML mapping" }]);
  });

  it("names unknown keys and enum values in plain words", () => {
    const record = base.r0() as unknown as Record<string, unknown>;
    record.colour = "red";
    record.class = "R9";
    expect(checkSchema("record", record)).toEqual([
      { path: "colour", message: "isn't a field here; see docs/SCHEMA.md for the fields allowed" },
      { path: "class", message: "must be one of: R0, R1, R2, R3, R4, R5" },
    ]);
  });

  it("explains id patterns", () => {
    const record = base.r0();
    record.id = "Acme.Invoices";
    expect(checkSchema("record", record)).toEqual([
      { path: "id", message: "must be <provider>.<resource>.<verb>: lowercase parts of a-z, 0-9 and _, separated by dots" },
    ]);
  });
});

describe("describeErrors", () => {
  it("drops if/anyOf wrappers and keeps the matching branch's error", () => {
    const issues = describeErrors(
      [
        error({ keyword: "type", instancePath: "/undo/operation", params: { type: "null" } }),
        error({ keyword: "required", instancePath: "/undo/operation", params: { missingProperty: "path" } }),
        error({ keyword: "anyOf", instancePath: "/undo/operation", params: {} }),
        error({ keyword: "if", instancePath: "", params: { failingKeyword: "else" } }),
      ],
      "record",
    );
    expect(issues).toEqual([{ path: "undo.operation.path", message: "missing `path`" }]);
  });

  it("lists the allowed types when every branch fails on type", () => {
    const issues = describeErrors(
      [
        error({ keyword: "type", instancePath: "/undo/capture/0", params: { type: "string" } }),
        error({ keyword: "type", instancePath: "/undo/capture/0", params: { type: "object" } }),
        error({ keyword: "anyOf", instancePath: "/undo/capture/0", params: {} }),
      ],
      "record",
    );
    expect(issues).toEqual([{ path: "undo.capture[0]", message: "must be a string or a mapping" }]);
  });

  it("reports a missing evidence type once", () => {
    const issues = describeErrors(
      [
        error({ keyword: "required", instancePath: "/evidence/0", params: { missingProperty: "type" } }),
        error({ keyword: "discriminator", instancePath: "/evidence/0", params: { error: "tag", tag: "type" } }),
      ],
      "record",
    );
    expect(issues).toEqual([{ path: "evidence[0].type", message: "missing `type`" }]);
  });

  it("falls back to Ajv's message for keywords it has no wording for", () => {
    const issues = describeErrors([error({ keyword: "maxLength", instancePath: "/title", message: "must NOT have more than 3 characters" })], "record");
    expect(issues).toEqual([{ path: "title", message: "must NOT have more than 3 characters" }]);
  });
});
