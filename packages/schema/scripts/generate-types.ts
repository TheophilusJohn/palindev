// Generates src/generated/record.ts and src/generated/provider.ts from the JSON Schemas.
// Run with `pnpm --filter @palindev/schema generate` after changing a schema;
// test/generated.test.ts fails while the committed files are stale.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateTypes } from "./types.js";

const outputs = await generateTypes();
for (const { file, source } of outputs) {
  writeFileSync(fileURLToPath(new URL(`../src/generated/${file}`, import.meta.url)), source);
  console.log(`wrote src/generated/${file}`);
}
