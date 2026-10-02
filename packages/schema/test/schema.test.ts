import { afterAll, describe, expect, it } from "vitest";
import type { PalinRecord } from "../src/generated/record.js";
import { checkSchema, createAjv, providerSchema, recordSchema } from "../src/schema-check.js";
import { checkStructure } from "../src/structural.js";
import { fixText } from "../src/fix.js";
import { base, baseText, brief, check, problemsOf, removeTempRoots, tempRoot } from "./helpers.js";

function aws(record: PalinRecord): PalinRecord {
  record.id = "aws.tags.update";
  record.provider = "aws";
  record.operation = { ...record.operation, service: "s3" };
  if (record.undo?.operation) record.undo.operation = { ...record.undo.operation, service: "s3" };
  return record;
}

afterAll(removeTempRoots);

const BEFORE = { kind: "http" as const, method: "GET" as const, path: "/v1/tags/{tag}" };

describe("record.schema.json and provider.schema.json", () => {
  it("compile with the production Ajv options", () => {
    const ajv = createAjv();
    expect(() => ajv.compile(recordSchema)).not.toThrow();
    expect(() => ajv.compile(providerSchema)).not.toThrow();
  });

  it("keep their shared definitions identical", () => {
    for (const name of ["providerId", "fieldPath", "supports", "docEvidence", "vendorStatementEvidence"] as const) {
      expect(providerSchema.$defs[name], name).toEqual(recordSchema.$defs[name]);
    }
  });

  it("require the non-draft fields unless the record is a draft", () => {
    const record = base.r0();
    delete record.summary;
    delete record.flags?.bulk;
    expect(checkSchema("record", record)).toEqual([
      { path: "summary", message: "missing `summary` (required unless confidence is draft)" },
      { path: "flags.bulk", message: "missing `bulk` (required unless confidence is draft)" },
    ]);
  });

  it("asks for an unquoted version to be quoted", () => {
    const record = base.r0() as unknown as Record<string, unknown>;
    record.api_version = 2024.1;
    expect(checkSchema("record", record)).toEqual([{ path: "api_version", message: "must be a string; quote the value so it stays a string" }]);
  });

  describe("operation", () => {
    it("requires a method for http and forbids it otherwise", () => {
      const http = base.r0();
      delete http.operation.method;
      expect(problemsOf(http)).toEqual(["schema operation.method"]);
      const graphql = base.r0();
      graphql.operation = { kind: "graphql", method: "POST", path: "invoice" };
      expect(problemsOf(graphql)).toEqual(["schema operation.method"]);
      graphql.operation = { kind: "graphql", path: "invoice" };
      expect(problemsOf(graphql)).toEqual([]);
    });

    it("requires service on every aws operation, including captures inside variants", () => {
      expect(problemsOf(aws(base.r2()))).toEqual([]);
      const record = aws(base.r2());
      delete record.operation.service;
      expect(problemsOf(record)).toEqual(["schema operation.service"]);
      const undo = aws(base.r2());
      undo.undo = { ...undo.undo, capture: [{ before: BEFORE, field: "tag.name" }] };
      expect(problemsOf(undo)).toEqual(["schema undo.capture[0].before.service"]);
      const variant = aws(base.r2());
      variant.variants = [
        {
          when: { plan: "free" },
          undo: { ...(variant.undo as Required<NonNullable<PalinRecord["undo"]>>), capture: [{ before: BEFORE, field: "tag.name" }] },
        },
      ];
      expect(problemsOf(variant)).toEqual(["schema variants[0].undo.capture[0].before.service"]);
    });

    it("keeps service lowercase", () => {
      const record = base.r0();
      record.operation = { ...record.operation, service: "S3" };
      expect(problemsOf(record)).toEqual(["schema operation.service"]);
    });
  });

  describe("aliases", () => {
    it("allows match or operation_from_args, never both", () => {
      const record = base.r0();
      record.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "x", match: { a: 1 }, operation_from_args: { method: "m", path: "p" } }];
      expect(problemsOf(record)).toEqual(["schema mcp_tool_aliases[0].operation_from_args"]);
    });

    it("needs operation_from_args to name both arguments", () => {
      const record = base.r0() as unknown as { mcp_tool_aliases: unknown };
      record.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "x", operation_from_args: { method: "m" } }];
      expect(problemsOf(record)).toEqual(["schema mcp_tool_aliases[0].operation_from_args.path"]);
    });

    it("rejects empty matchers and empty value lists", () => {
      const record = base.r0();
      record.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "x", match: {} }];
      record.cli_aliases = [{ command: "acme invoices get", match: { id: [] as unknown as [string] } }];
      expect(problemsOf(record)).toEqual(["schema mcp_tool_aliases[0].match", "schema cli_aliases[0].match.id"]);
    });

    it("writes CLI flag names without dashes", () => {
      const record = base.r0();
      record.cli_aliases = [{ command: "acme api", match: { "--method": "GET" } }];
      expect(problemsOf(record)).toEqual(["schema cli_aliases[0].match.--method"]);
    });
  });

  describe("variants", () => {
    it("need a non-empty when", () => {
      const record = base.r3();
      record.variants = [{ when: {} }, { when: { args: {} } }, { when: { plan: [] as unknown as [string] } }];
      expect(problemsOf(record)).toEqual(["schema variants[0].when", "schema variants[1].when.args", "schema variants[2].when.plan"]);
    });

    it("set a complete undo object when they set one", () => {
      const record = base.r3();
      record.variants = [{ when: { plan: "free" }, undo: { method: "inverse_call" } as NonNullable<PalinRecord["variants"]>[number]["undo"] }];
      expect(problemsOf(record)).toEqual([
        "schema variants[0].undo.operation",
        "schema variants[0].undo.steps",
        "schema variants[0].undo.window",
        "schema variants[0].undo.window_condition",
        "schema variants[0].undo.compensating_action",
        "schema variants[0].undo.capture",
      ]);
    });

    it("may clear approval_text and notes with null, but not set them empty", () => {
      const record = base.r3();
      record.variants = [{ when: { plan: "free" }, approval_text: "", notes: null }];
      expect(problemsOf(record)).toEqual(["schema variants[0].approval_text"]);
    });
  });

  describe("evidence", () => {
    it("rejects an unknown type", () => {
      const record = base.r0() as unknown as { evidence: unknown[] };
      record.evidence = [{ type: "blog", url: "https://example.com/post" }];
      expect(checkSchema("record", record)).toEqual([
        { path: "evidence[0].type", message: "must be doc, sandbox_run, community, vendor_statement or todo" },
      ]);
    });

    it("doesn't let a todo carry supports", () => {
      const record = base.r0() as unknown as { confidence: string; evidence: unknown[]; last_verified?: string };
      record.confidence = "draft";
      delete record.last_verified;
      record.evidence.push({ type: "todo", field: "summary", note: "Check it.", supports: ["summary"] });
      expect(problemsOf(record)).toEqual(["schema evidence[1].supports"]);
    });

    it("checks field paths in supports and todo items", () => {
      const record = base.r0();
      record.evidence = [{ type: "doc", url: "https://docs.acme.example/a", quote: "A quote.", retrieved: "2026-09-28", supports: ["variants[0]when"] }];
      expect(problemsOf(record)).toEqual(["schema evidence[0].supports[0]"]);
    });
  });

  describe("provider files", () => {
    it("accept the base provider", () => {
      expect(checkSchema("provider", base.provider())).toEqual([]);
    });

    it("allow a null signup_url only when there's no sandbox", () => {
      const provider = base.provider();
      provider.sandbox.signup_url = null;
      expect(checkSchema("provider", provider).map((issue) => issue.path)).toEqual(["sandbox.signup_url"]);
      provider.sandbox.kind = "none";
      expect(checkSchema("provider", provider)).toEqual([]);
    });

    it("need consent filled in completely or null", () => {
      const provider = base.provider() as unknown as { terms: { consent: unknown } };
      provider.terms.consent = { date: "2026-09-01", from: "", reference: "private/consent/acme.md" };
      expect(checkSchema("provider", provider).map((issue) => issue.path)).toEqual(["terms.consent.from"]);
    });

    it("hold doc and vendor_statement evidence only", () => {
      const provider = base.provider() as unknown as { evidence: unknown[] };
      provider.evidence = [{ type: "todo", field: "terms", note: "Find the clause." }];
      expect(checkSchema("provider", provider)).toEqual([{ path: "evidence[0].type", message: "must be doc or vendor_statement" }]);
    });
  });

  describe("evidence type", () => {
    it.each([5, null, true, ["doc"]])("rejects a non-string type (%j) in records and provider files", (type) => {
      const record = base.r0() as unknown as { evidence: Array<Record<string, unknown>> };
      record.evidence.push({ type, anything: "goes" });
      expect(checkSchema("record", record)).toEqual([
        { path: "evidence[1].type", message: "must be doc, sandbox_run, community, vendor_statement or todo" },
      ]);
      const provider = base.provider() as unknown as { evidence: Array<Record<string, unknown>> };
      provider.evidence.push({ type });
      expect(checkSchema("provider", provider)).toEqual([{ path: "evidence[1].type", message: "must be doc or vendor_statement" }]);
    });

    it.each(["constructor", "__proto__", "toString"])("rejects type %s without crashing anything", (type) => {
      const text = baseText("r0").replace("  - type: doc\n", `  - type: ${type}\n`);
      const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/invoices.get.yaml": text });
      expect(brief(check(root))).toEqual(["invoices.get.yaml schema evidence[0].type"]);
      expect(() => fixText(text, "record")).not.toThrow();
    });
  });

  describe("plain messages", () => {
    it("names the missing service on an aws operation", () => {
      const record = aws(base.r2());
      delete record.operation.service;
      expect(checkSchema("record", record)).toEqual([{ path: "operation.service", message: "missing `service`: every aws operation names its service" }]);
    });

    it("names a missing http method, and a method on another kind", () => {
      const http = base.r0();
      delete http.operation.method;
      expect(checkSchema("record", http)).toEqual([{ path: "operation.method", message: "missing `method`: http operations name their method" }]);
      const rpc = base.r0();
      rpc.operation = { kind: "rpc", method: "POST", path: "invoices.get" };
      expect(checkSchema("record", rpc)).toEqual([{ path: "operation.method", message: "only http operations have a method" }]);
    });

    it("reports only the kind when the kind itself is missing or wrong", () => {
      const missing = base.r0() as unknown as { operation: Record<string, unknown> };
      delete missing.operation.kind;
      expect(checkSchema("record", missing)).toEqual([{ path: "operation.kind", message: "missing `kind`" }]);
      const wrong = base.r0() as unknown as { operation: Record<string, unknown> };
      wrong.operation.kind = "HTTP";
      expect(checkSchema("record", wrong)).toEqual([{ path: "operation.kind", message: "must be one of: http, graphql, rpc" }]);
    });

    it("explains match with operation_from_args, CLI flags with dashes and a partial variant undo", () => {
      const record = base.r3();
      record.mcp_tool_aliases = [{ server: "acme/acme-mcp", tool: "x", match: { a: 1 }, operation_from_args: { method: "m", path: "p" } }];
      record.cli_aliases = [{ command: "acme api", match: { "--method": "GET" } }];
      record.variants = [{ when: { plan: "free" }, undo: { method: "inverse_call", operation: null, steps: [], window: null, window_condition: null, compensating_action: null } as NonNullable<PalinRecord["variants"]>[number]["undo"] }];
      expect(checkSchema("record", record)).toEqual([
        { path: "mcp_tool_aliases[0].operation_from_args", message: "an alias has match or operation_from_args, not both" },
        { path: "cli_aliases[0].match.--method", message: "flag names in a CLI match are written without dashes" },
        { path: "variants[0].undo.capture", message: "missing `capture` (a variant's undo is a complete undo object)" },
      ]);
    });
  });

  it("allows any value in a sandbox run's tested_on.settings, as SCHEMA.md types it (object)", () => {
    const record = base.r2();
    record.evidence.push({
      type: "sandbox_run",
      run_id: "2026-09-29T10-15-00Z_acme.tags.update_cd34ef",
      date: "2026-09-29",
      environment: "test_mode",
      result: "fail",
      observed_class: "R2",
      trace_sha256: "0123456789abcdef".repeat(4),
      trace_path: "runs/2026/09/2026-09-29T10-15-00Z_acme.tags.update_cd34ef.json",
      tested_on: { plan: null, settings: { sso: { enforced: true }, retention_days: null, tags: [] }, variant: null },
      vendor_paid: false,
    });
    expect(problemsOf(record)).toEqual([]);
  });

  describe("structural checks reported as schema", () => {
    function withRun(trace_path: string, variant: number | null = null): PalinRecord {
      const record = base.r2();
      record.evidence.push({
        type: "sandbox_run",
        run_id: "2026-09-29T10-15-00Z_acme.tags.update_cd34ef",
        date: "2026-09-29",
        environment: "test_mode",
        result: "fail",
        observed_class: "R2",
        trace_sha256: "0123456789abcdef".repeat(4),
        trace_path,
        tested_on: { plan: null, settings: {}, variant },
        vendor_paid: false,
      });
      return record;
    }

    it("accept a trace path under the run's month named after the run", () => {
      expect(checkStructure(withRun("runs/2026/09/2026-09-29T10-15-00Z_acme.tags.update_cd34ef.json"))).toEqual([]);
    });

    it("reject a trace path for another run or month", () => {
      expect(problemsOf(withRun("runs/2026/09/another-run.json"))).toEqual(["schema evidence[1].trace_path"]);
      expect(problemsOf(withRun("runs/2026/08/2026-09-29T10-15-00Z_acme.tags.update_cd34ef.json"))).toEqual([
        "schema evidence[1].trace_path",
      ]);
    });

    it("reject a tested_on.variant that points past the variants", () => {
      expect(problemsOf(withRun("runs/2026/09/2026-09-29T10-15-00Z_acme.tags.update_cd34ef.json", 0))).toEqual([
        "schema evidence[1].tested_on.variant",
      ]);
    });
  });
});
