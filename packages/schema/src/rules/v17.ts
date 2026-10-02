import type { Operation, PalinRecord } from "../generated/record.js";
import type { Issue } from "../problems.js";

export interface V17Record {
  /** Absolute path, used to attach issues. */
  file: string;
  providerDir: string;
  record: PalinRecord;
}

/** service, method and path with every `{param}` normalized to `{}`, whatever the kind. */
export function operationKey(operation: Operation): string {
  return [operation.service, operation.method, operation.path.replace(/\{[^}]*\}/g, "{}")]
    .filter((part) => part !== undefined)
    .join(" ");
}

/**
 * V17: `related` ids exist in the data root. Within a provider, no two records share an operation,
 * and no server and tool pair appears on two records if either alias has neither `match` nor
 * `operation_from_args`. Issues are keyed by file and reported on every record involved.
 */
export function v17(records: readonly V17Record[], knownIds: ReadonlySet<string>): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  const push = (file: string, issue: Issue) => out.set(file, [...(out.get(file) ?? []), issue]);

  for (const { file, record } of records) {
    record.related?.forEach((id, index) => {
      if (!knownIds.has(id)) push(file, { path: `related[${index}]`, message: `${id} isn't a record in this data root` });
    });
  }

  const byOperation = new Map<string, V17Record[]>();
  for (const entry of records) {
    const key = `${entry.providerDir}\u0000${operationKey(entry.record.operation)}`;
    byOperation.set(key, [...(byOperation.get(key) ?? []), entry]);
  }
  for (const group of byOperation.values()) {
    if (group.length < 2) continue;
    for (const entry of group) {
      const others = group.filter((other) => other !== entry).map((other) => other.record.id);
      push(entry.file, {
        path: "operation",
        message: `same operation as ${others.join(", ")} (${operationKey(entry.record.operation)}); within a provider each operation has one record`,
      });
    }
  }

  interface AliasUse {
    entry: V17Record;
    index: number;
    plain: boolean;
  }
  const byTool = new Map<string, AliasUse[]>();
  for (const entry of records) {
    entry.record.mcp_tool_aliases?.forEach((alias, index) => {
      const key = `${entry.providerDir}\u0000${alias.server}\u0000${alias.tool}`;
      const plain = alias.match === undefined && alias.operation_from_args === undefined;
      byTool.set(key, [...(byTool.get(key) ?? []), { entry, index, plain }]);
    });
  }
  for (const uses of byTool.values()) {
    for (const use of uses) {
      const clashes = uses.filter((other) => other.entry !== use.entry && (other.plain || use.plain));
      if (clashes.length === 0) continue;
      const alias = use.entry.record.mcp_tool_aliases?.[use.index];
      const ids = [...new Set(clashes.map((other) => other.entry.record.id))];
      push(use.entry.file, {
        path: `mcp_tool_aliases[${use.index}]`,
        message: `${alias?.server} ${alias?.tool} is also an alias on ${ids.join(", ")}; a tool without match or operation_from_args can map to only one record`,
      });
    }
  }
  return out;
}
