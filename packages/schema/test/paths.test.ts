import { describe, expect, it } from "vitest";
import { parseYaml } from "../src/load.js";
import { formatPath, locate, parsePath, pathAtOffset, pointerToSegments } from "../src/paths.js";

const TEXT = `id: acme.invoices.send
variants:
  - when:
      args: { send_email: false }
    class: R2
evidence:
  - type: doc
    supports: [summary, "variants[0].when"]
`;

describe("paths", () => {
  it("formats and parses the supports syntax", () => {
    expect(formatPath(["variants", 0, "when", "args"])).toBe("variants[0].when.args");
    expect(formatPath([])).toBe("(file)");
    expect(parsePath("variants[0].residue[2].audience")).toEqual(["variants", 0, "residue", 2, "audience"]);
    expect(parsePath("(file)")).toEqual([]);
  });

  it("turns JSON Pointers into segments", () => {
    expect(pointerToSegments("")).toEqual([]);
    expect(pointerToSegments("/variants/0/when/a~1b")).toEqual(["variants", 0, "when", "a/b"]);
  });

  it("locates a path's key, or the nearest parent that exists", () => {
    const { doc, lineCounter } = parseYaml(TEXT);
    expect(locate(doc, lineCounter, ["variants", 0, "class"])).toEqual({ line: 5, col: 5 });
    expect(locate(doc, lineCounter, ["evidence", 0, "supports", 1])).toEqual({ line: 8, col: 25 });
    expect(locate(doc, lineCounter, ["variants", 0, "undo", "method"])).toEqual({ line: 3, col: 5 });
    expect(locate(doc, lineCounter, [])).toEqual({ line: 1, col: 1 });
  });

  it("finds the field that holds a text offset", () => {
    const { doc } = parseYaml(TEXT);
    expect(pathAtOffset(doc, TEXT.indexOf("send_email"))).toEqual(["variants", 0, "when", "args", "send_email"]);
    expect(pathAtOffset(doc, TEXT.indexOf("acme.invoices"))).toEqual(["id"]);
    expect(pathAtOffset(doc, TEXT.indexOf("variants:"))).toEqual(["variants"]);
  });
});
