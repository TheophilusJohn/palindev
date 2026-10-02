import { describe, expect, it } from "vitest";
import type { PalinRecord } from "../../src/generated/record.js";
import { operationKey, v17, type V17Record } from "../../src/rules/v17.js";
import { base, fixtureTests } from "../helpers.js";

function entry(record: PalinRecord, providerDir = "acme"): V17Record {
  return { file: `/data/${providerDir}/${record.id}.yaml`, providerDir, record };
}

function paths(result: Map<string, { path: string }[]>): string[] {
  return [...result.entries()].flatMap(([file, issues]) => issues.map((issue) => `${file} ${issue.path}`)).sort();
}

describe("V17: related ids exist; operations and plain aliases are unique within a provider", () => {
  fixtureTests("V17", ["invoices.get.yaml V17 operation", "invoices.retrieve.yaml V17 operation"]);

  it("normalizes path parameters and keeps the service in the key", () => {
    expect(operationKey({ kind: "http", method: "GET", path: "/v1/invoices/{invoice}" })).toBe("GET /v1/invoices/{}");
    expect(operationKey({ kind: "http", service: "s3", method: "DELETE", path: "/{Bucket}/{Key+}" })).toBe("s3 DELETE /{}/{}");
    expect(operationKey({ kind: "graphql", path: "deleteRepository" })).toBe("deleteRepository");
  });

  it("reports a related id that isn't in the root", () => {
    const record = base.r0();
    record.related = ["acme.invoices.send", "acme.invoices.void"];
    expect(paths(v17([entry(record)], new Set(["acme.invoices.get", "acme.invoices.send"])))).toEqual([
      "/data/acme/acme.invoices.get.yaml related[1]",
    ]);
  });

  it("allows the same operation under different services or providers", () => {
    const a = base.r0();
    const b = base.r0();
    b.id = "acme.objects.get";
    a.operation = { ...a.operation, service: "s3" };
    b.operation = { ...b.operation, service: "glacier" };
    expect(paths(v17([entry(a), entry(b)], new Set()))).toEqual([]);
    const c = base.r0();
    expect(paths(v17([entry(base.r0()), entry(c, "other")], new Set()))).toEqual([]);
  });

  it("rejects a plain alias that another record in the provider also uses", () => {
    const a = base.r0();
    const b = base.r2();
    a.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "acme_call" }];
    b.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "acme_call", match: { method: "update_tag" } }];
    expect(paths(v17([entry(a), entry(b)], new Set()))).toEqual([
      "/data/acme/acme.invoices.get.yaml mcp_tool_aliases[0]",
      "/data/acme/acme.tags.update.yaml mcp_tool_aliases[0]",
    ]);
  });

  it("allows one tool on several records when every alias has a matcher", () => {
    const a = base.r0();
    const b = base.r2();
    a.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "acme_api_write", operation_from_args: { method: "method", path: "path" } }];
    b.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "acme_api_write", operation_from_args: { method: "method", path: "path" } }];
    expect(paths(v17([entry(a), entry(b)], new Set()))).toEqual([]);
  });

  it("checks aliases within a provider, as SCHEMA.md words it", () => {
    const a = base.r0();
    const b = base.r2();
    a.mcp_tool_aliases = [{ server: "shared/mcp", tool: "call" }];
    b.mcp_tool_aliases = [{ server: "shared/mcp", tool: "call" }];
    expect(paths(v17([entry(a), entry(b, "other")], new Set()))).toEqual([]);
  });
});
