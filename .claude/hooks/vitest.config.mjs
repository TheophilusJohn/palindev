import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  // Never load .env files into tests (CLAUDE.md rule 4).
  envDir: false,
  test: {
    include: ["test/**/*.test.mjs"],
    // Each test spawns the hooks (the stop-check tests run pnpm up to four times); slow CI runners need room.
    testTimeout: 30_000,
  },
});
