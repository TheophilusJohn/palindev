import { isMap } from "yaml";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../src/load.js";
import {
  EVIDENCE_KEYS,
  PROVIDER_KEYS,
  RECORD_KEYS,
  firstOutOfOrder,
  keyName,
  orderedMaps,
  presentInOrder,
  quoteTargets,
} from "../src/order.js";
import { recordSchema, providerSchema } from "../src/schema-check.js";
import { baseText } from "./helpers.js";

describe("key orders", () => {
  it("cover every top-level key in the schemas", () => {
    expect([...RECORD_KEYS].sort()).toEqual(Object.keys(recordSchema.properties).sort());
    expect([...PROVIDER_KEYS].sort()).toEqual(Object.keys(providerSchema.properties).sort());
  });

  it("put supports last in every evidence type that has it", () => {
    for (const [type, keys] of Object.entries(EVIDENCE_KEYS)) {
      if (keys.includes("supports")) expect(keys.at(-1), type).toBe("supports");
      expect(keys[0], type).toBe("type");
    }
  });

  it("visit nested maps at every level, outermost first", () => {
    const { doc } = parseYaml(baseText("r2"));
    expect(orderedMaps(doc, "record").map((entry) => entry.path.join("."))).toEqual([
      "",
      "operation",
      "flags",
      "undo",
      "undo.operation",
      "suggested_annotations",
      "evidence.0",
    ]);
  });

  it("find the first key out of order, and the order of the keys present", () => {
    const { doc } = parseYaml("title: t\nid: x\nnotes: n\n");
    const map = doc.contents;
    if (!isMap(map)) throw new Error("expected a map");
    expect(firstOutOfOrder(map, RECORD_KEYS)).toEqual({ key: "id", after: "title" });
    expect(presentInOrder(map, RECORD_KEYS)).toEqual(["id", "title", "notes"]);
    expect(map.items.map(keyName)).toEqual(["title", "id", "notes"]);
  });

  it("find the plain values SCHEMA.md asks to quote, and nothing already quoted", () => {
    const plain = parseYaml("api_version: 2026-09-01\nflags:\n  idempotent: no\n").doc;
    expect(quoteTargets(plain, "record").map((target) => target.path.join("."))).toEqual(["api_version", "flags.idempotent"]);
    expect(quoteTargets(parseYaml(baseText("r3")).doc, "record")).toEqual([]);
    expect(quoteTargets(parseYaml("current_api_version: 2026-09-01\n").doc, "provider").map((target) => target.path.join("."))).toEqual([
      "current_api_version",
    ]);
  });
});
