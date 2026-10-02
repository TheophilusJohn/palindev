import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderFile } from "../src/generated/provider.js";
import type { PalinRecord, SandboxRunEvidence } from "../src/generated/record.js";
import { loadDataRoot } from "../src/load.js";
import { validateRepo } from "../src/validate.js";
import { NOW, VALID_ROOT, base, check, problemsOf } from "./helpers.js";

function load(): { provider: ProviderFile; records: Map<string, PalinRecord> } {
  const root = loadDataRoot(VALID_ROOT);
  const provider = root.providers.get("acme")?.data as ProviderFile;
  return { provider, records: new Map(root.records.map((file) => [file.stem, file.data as PalinRecord])) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the valid acme root", () => {
  it("validates with zero errors and zero warnings", () => {
    expect(check(VALID_ROOT)).toEqual([]);
  });

  it("validates clean with the default date too", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${NOW}T12:00:00Z`));
    expect(validateRepo({ root: VALID_ROOT, probeMailDomain: undefined }).problems).toEqual([]);
  });

  it("has a provider with green terms and no consent", () => {
    const { provider } = load();
    expect(provider.terms).toMatchObject({ status: "green", consent: null });
  });

  it("has an R0 with a plain MCP alias, a CLI alias and an operation service", () => {
    const record = load().records.get("invoices.get");
    expect(record).toMatchObject({ class: "R0", confidence: "documented", operation: { service: "billing" } });
    expect(record?.mcp_tool_aliases).toEqual([{ server: "acme/acme-mcp", tool: "get_invoice" }]);
    expect(record?.cli_aliases).toEqual([{ command: "acme invoices get" }]);
  });

  it("has an R3 with variants, both alias matchers, a CLI matcher and related", () => {
    const record = load().records.get("invoices.send");
    expect(record).toMatchObject({ class: "R3", confidence: "documented", related: ["acme.invoices.get"] });
    expect(record?.approval_text).toBeTruthy();
    expect(record?.variants?.map((variant) => [variant.class, variant.approval_text])).toEqual([
      ["R2", null],
      ["R2", null],
    ]);
    expect(record?.variants?.map((variant) => Object.keys(variant.when))).toEqual([["args"], ["settings", "plan"]]);
    expect(record?.mcp_tool_aliases?.some((alias) => alias.match !== undefined)).toBe(true);
    expect(record?.mcp_tool_aliases?.some((alias) => alias.operation_from_args !== undefined)).toBe(true);
    expect(record?.cli_aliases?.some((alias) => alias.match !== undefined)).toBe(true);
  });

  it("has an R5 draft with todos, an open question and no last_verified", () => {
    const record = load().records.get("customers.delete");
    expect(record).toMatchObject({ class: "R5", confidence: "draft" });
    expect(record?.last_verified).toBeUndefined();
    expect(record?.evidence.filter((item) => item.type === "todo").map((item) => item.type === "todo" && item.field)).toEqual([
      "api_version",
      "flags.needs_admin_scope",
      "approval_text",
    ]);
    expect(record?.notes).toMatch(/^Open question:/);
  });

  it("has a tested R2 whose sandbox run carries tested_on and vendor_paid, with before captures and probe residue", () => {
    const record = load().records.get("tags.update");
    expect(record).toMatchObject({ class: "R2", confidence: "tested" });
    const run = record?.evidence.find((item): item is SandboxRunEvidence => item.type === "sandbox_run");
    expect(run).toMatchObject({ result: "pass", observed_class: "R2", tested_on: { plan: "free", settings: {}, variant: null }, vendor_paid: false });
    expect(record?.undo?.capture?.filter((item) => typeof item === "object" && "before" in item)).toHaveLength(2);
    expect(record?.residue?.[0]?.observed_by).toBe("probe");
  });
});

describe("the base records in test/fixtures/bases", () => {
  it.each(["r0", "r1", "r2", "r3", "r4", "r5"] as const)("%s validates clean on its own", (name) => {
    expect(problemsOf(base[name]())).toEqual([]);
  });
});
