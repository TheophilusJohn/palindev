import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  dts: {
    entry: "src/index.ts",
    // tsup 8.5 injects baseUrl into its declaration build, and TypeScript 6 rejects baseUrl
    // (TS5101, egoist/tsup#1388). Scoped to that build so `pnpm typecheck` still reports
    // deprecations. See D26.
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
});
