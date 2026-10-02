import { defineConfig } from "vitest/config";

export default defineConfig({
  // Never load .env files into tests (CLAUDE.md rule 4); the validator reads only process.env.
  envDir: false,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
