#!/usr/bin/env node
// Stop hook. If data/ changed (uncommitted, or committed on this branch but not on main),
// runs `pnpm validate`; if code changed (packages/, apps/, tests/, .claude/hooks/), also runs
// `pnpm test` and `pnpm typecheck`.
// A failure blocks stopping and tells Claude what to fix.
// Skips when PALIN_SKIP_STOP_CHECKS=1, when already continuing from a previous block,
// before the scripts exist, or when nothing changed since the last passing check.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
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

// A large buffer, so a big diff is read whole rather than cut off at Node's 1 MB default.
const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });

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
const codeChanged = files.some((f) => /^(packages|apps|tests|\.claude\/hooks)\//.test(f));
if (!dataChanged && !codeChanged) process.exit(0);

// Skip if the working tree is identical to the last state that passed.
const gitDir = git(["rev-parse", "--git-dir"], root).stdout.trim();
const stampFile = resolve(root, gitDir, "palin-stop-ok");
// Untracked files count by content, not just by name, so editing a new file re-runs the checks. If any
// part of the key can't be read in full, the stamp is neither trusted nor written.
let keyOk = true;
const keyGit = (args) => {
  const r = git(args, root);
  if (r.error || r.status !== 0) keyOk = false;
  return r.stdout ?? "";
};
const hash = createHash("sha256").update(keyGit(["rev-parse", "HEAD"])).update(keyGit(["diff", "HEAD", "--binary"]));
for (const f of keyGit(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) {
  hash.update(`\0${f}\0`);
  // A symlink counts by its target path, never by what it points at (a FIFO could hang, and a link to a
  // credential file would be read); anything else that isn't a regular file counts by name only.
  try {
    const path = resolve(root, f);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) hash.update(`->${readlinkSync(path)}`);
    else if (st.isFile()) hash.update(readFileSync(path));
  } catch {}
}
const key = hash.digest("hex");
try {
  if (keyOk && readFileSync(stampFile, "utf8").trim() === key) process.exit(0);
} catch {}

function pnpm(args, timeout) {
  const opts = { cwd: root, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 };
  let r = spawnSync("pnpm", args, opts);
  if (r.error?.code === "ENOENT") r = spawnSync("corepack", ["pnpm", ...args], opts);
  return r;
}

// A check that fails, times out or overflows blocks; only a missing pnpm skips it (CI still runs it).
const failures = [];
function check(name, args, timeout) {
  const r = pnpm(args, timeout);
  if (r.error?.code === "ENOENT") return;
  if (r.error) {
    const why = r.error.code === "ETIMEDOUT" ? `timed out after ${timeout / 1000} s` : (r.error.code ?? r.error.message);
    r.stderr = `${r.stderr ?? ""}\n${name} did not finish: ${why}`;
    failures.push([name, r]);
  } else if (r.status !== 0) failures.push([name, r]);
}

if (dataChanged && pkg.scripts?.validate) check("pnpm validate", ["-s", "validate"], 90_000);
if (codeChanged && pkg.scripts?.test) check("pnpm test", ["-s", "test"], 240_000);
// Vitest strips types without checking them, so type errors surface only here (Definition of done).
// It checks the packages; the hooks are plain .mjs and get only their tests.
if (codeChanged && pkg.scripts?.typecheck) check("pnpm typecheck", ["-s", "typecheck"], 120_000);

if (failures.length) {
  const reason = failures
    .map(([name, r]) => {
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-30).join("\n").slice(-4000);
      return `${name} failed:\n${tail}`;
    })
    .join("\n\n");
  process.stdout.write(JSON.stringify({ decision: "block", reason: `Fix before finishing.\n\n${reason}` }));
} else if (keyOk) {
  try {
    writeFileSync(stampFile, key);
  } catch {}
}
process.exit(0);
