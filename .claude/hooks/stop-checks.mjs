#!/usr/bin/env node
// Stop hook. If data/ changed (uncommitted, or committed on this branch but not on main),
// runs `pnpm validate`; if code changed (packages/, apps/, tests/), also runs `pnpm test`.
// A failure blocks stopping and tells Claude what to fix.
// Skips when PALIN_SKIP_STOP_CHECKS=1, when already continuing from a previous block,
// before the scripts exist, or when nothing changed since the last passing check.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

if (input.stop_hook_active === true || process.env.PALIN_SKIP_STOP_CHECKS === "1") process.exit(0);

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });

const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const top = git(["rev-parse", "--show-toplevel"], start);
if (top.status !== 0) process.exit(0);
const root = realpathSync(top.stdout.trim());

let pkg;
try {
  pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
} catch {
  process.exit(0);
}
if (!existsSync(resolve(root, "node_modules"))) process.exit(0);

// Files changed: uncommitted, untracked, and committed on this branch but not on main.
const changed = new Set();
for (const line of git(["status", "--porcelain"], root).stdout.split("\n").filter(Boolean)) {
  changed.add(line.slice(3).replace(/^"|"$/g, "").split(" -> ").pop());
}
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root).stdout.trim();
if (branch && branch !== "main" && git(["rev-parse", "--verify", "--quiet", "main"], root).status === 0) {
  for (const f of git(["diff", "--name-only", "main...HEAD"], root).stdout.split("\n").filter(Boolean)) changed.add(f);
}

const files = [...changed];
const dataChanged = files.some((f) => f.startsWith("data/"));
const codeChanged = files.some((f) => /^(packages|apps|tests)\//.test(f));
if (!dataChanged && !codeChanged) process.exit(0);

// Skip if the working tree is identical to the last state that passed.
const gitDir = git(["rev-parse", "--git-dir"], root).stdout.trim();
const stampFile = resolve(root, gitDir, "palin-stop-ok");
const key = createHash("sha256")
  .update(git(["rev-parse", "HEAD"], root).stdout)
  .update(git(["diff", "HEAD"], root).stdout)
  .update(git(["ls-files", "--others", "--exclude-standard"], root).stdout)
  .digest("hex");
try {
  if (readFileSync(stampFile, "utf8").trim() === key) process.exit(0);
} catch {}

function pnpm(args, timeout) {
  let r = spawnSync("pnpm", args, { cwd: root, encoding: "utf8", timeout });
  if (r.error?.code === "ENOENT") r = spawnSync("corepack", ["pnpm", ...args], { cwd: root, encoding: "utf8", timeout });
  return r;
}

const failures = [];
if (dataChanged && pkg.scripts?.validate) {
  const r = pnpm(["-s", "validate"], 90_000);
  if (!r.error && r.status !== 0) failures.push(["pnpm validate", r]);
}
if (codeChanged && pkg.scripts?.test) {
  const r = pnpm(["-s", "test"], 240_000);
  if (!r.error && r.status !== 0) failures.push(["pnpm test", r]);
}

if (failures.length) {
  const reason = failures
    .map(([name, r]) => {
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-30).join("\n");
      return `${name} failed:\n${tail}`;
    })
    .join("\n\n");
  process.stdout.write(JSON.stringify({ decision: "block", reason: `Fix before finishing.\n\n${reason}` }));
} else {
  try {
    writeFileSync(stampFile, key);
  } catch {}
}
process.exit(0);
