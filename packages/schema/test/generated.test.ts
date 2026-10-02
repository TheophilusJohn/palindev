import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateTypes } from "../scripts/types.js";

describe("generated types", () => {
  it("match the schemas (run `pnpm --filter @palindev/schema generate` if this fails)", async () => {
    for (const { file, source } of await generateTypes()) {
      const committed = readFileSync(new URL(`../src/generated/${file}`, import.meta.url), "utf8");
      expect(committed, `src/generated/${file} is stale`).toBe(source);
    }
  }, 30_000);
});
