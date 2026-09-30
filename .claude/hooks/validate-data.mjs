#!/usr/bin/env node
// PostToolUse hook for Edit and Write.
// When a file under data/ changes, run `pnpm validate <file>`. On failure, exit 2 so the
// errors go back to Claude to fix. Stays silent until `pnpm validate` exists (week 1).
// The repo root is found from the edited file with git, so worktrees and macOS path
// aliases (/private, case differences) resolve correctly.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const base = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
let abs;
try {
  abs = realpathSync(resolve(base, filePath));
} catch {
  process.exit(0); // file gone; nothing to validate
}

const top = spawnSync("git", ["-C", dirname(abs), "rev-parse", "--show-toplevel"], { encoding: "utf8" });
const root = top.status === 0 ? realpathSync(top.stdout.trim()) : realpathSync(base);

const rel = relative(root, abs).split(sep).join("/");
if (!rel.startsWith("data/") || !/\.ya?ml$/.test(rel)) process.exit(0);

// Bootstrap phase: no validate script yet, nothing to check.
let pkg;
try {
  pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
} catch {
  process.exit(0);
}
if (!pkg.scripts?.validate || !existsSync(resolve(root, "node_modules"))) process.exit(0);

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 55_000 });
}

let result = run("pnpm", ["-s", "validate", rel]);
if (result.error?.code === "ENOENT") result = run("corepack", ["pnpm", "-s", "validate", rel]);
if (result.error) process.exit(0); // pnpm unavailable; CI will catch it

if (result.status !== 0) {
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
  process.stderr.write(`pnpm validate failed for ${rel}. Fix these before moving on:\n${out}\n`);
  process.exit(2);
}
process.exit(0);
