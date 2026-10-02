// Compiles the JSON Schemas to TypeScript with json-schema-to-typescript. Shared by
// generate-types.ts (writes the files) and test/generated.test.ts (checks they're current).

import { readFileSync } from "node:fs";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const SCHEMAS = [
  { schema: "record.schema.json", file: "record.ts" },
  { schema: "provider.schema.json", file: "provider.ts" },
] as const;

export interface GeneratedFile {
  file: string;
  source: string;
}

export async function generateTypes(): Promise<GeneratedFile[]> {
  const out: GeneratedFile[] = [];
  for (const { schema, file } of SCHEMAS) {
    const path = new URL(`../${schema}`, import.meta.url);
    const json = JSON.parse(readFileSync(path, "utf8")) as JSONSchema;
    const source = await compile(json, json.title ?? schema, {
      bannerComment: `// Generated from ${schema} by scripts/generate-types.ts. Don't edit by hand:\n// change the schema and run \`pnpm --filter @palindev/schema generate\`.`,
      additionalProperties: false,
      unreachableDefinitions: false,
      format: true,
      strictIndexSignatures: true,
    });
    out.push({ file, source });
  }
  return out;
}
