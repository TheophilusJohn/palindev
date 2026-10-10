import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const STOP = join(import.meta.dirname, "..", "stop-checks.mjs");

// A throwaway repo whose package.json scripts pass or fail on demand, with a committed hook file.
function makeRepo(scripts) {
  const repo = mkdtempSync(join(tmpdir(), "palin-stop-"));
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "stop-test", private: true, scripts }));
  writeFileSync(join(repo, ".gitignore"), "node_modules/\npnpm-lock.yaml\n");
  mkdirSync(join(repo, "node_modules"));
  mkdirSync(join(repo, ".claude", "hooks"), { recursive: true });
  writeFileSync(join(repo, ".claude", "hooks", "a.mjs"), "// v1\n");
  git("add", ".");
  git("-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", "x");
  return repo;
}

function stop(repo, extra = {}) {
  const env = { ...process.env };
  delete env.PALIN_SKIP_STOP_CHECKS;
  const r = spawnSync(process.execPath, [STOP], {
    input: JSON.stringify({ cwd: repo, ...extra }),
    encoding: "utf8",
    env,
    timeout: 60_000,
  });
  return { status: r.status, out: r.stdout };
}

const pass = 'node -e "process.exit(0)"';
const fail = 'node -e "console.log(\'TYPE ERROR in a.ts\'); process.exit(1)"';
const repos = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe("stop-checks", () => {
  it("runs typecheck when a hook changed, and blocks on its failure", () => {
    const repo = makeRepo({ test: pass, typecheck: fail });
    repos.push(repo);
    writeFileSync(join(repo, ".claude", "hooks", "a.mjs"), "// v2\n");
    const r = stop(repo);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.out);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("pnpm typecheck failed");
    expect(out.reason).toContain("TYPE ERROR in a.ts");
  });

  it("passes when test and typecheck pass", () => {
    const repo = makeRepo({ test: pass, typecheck: pass });
    repos.push(repo);
    writeFileSync(join(repo, ".claude", "hooks", "a.mjs"), "// v2\n");
    const r = stop(repo);
    expect(r.status).toBe(0);
    expect(r.out).toBe("");
  });

  it("blocks when a failing check prints more than a megabyte", () => {
    const repo = makeRepo({ test: pass, typecheck: 'node -e "process.stdout.write(\'x\'.repeat(3e6)); process.exit(1)"' });
    repos.push(repo);
    writeFileSync(join(repo, ".claude", "hooks", "a.mjs"), "// v2\n");
    expect(JSON.parse(stop(repo).out).decision).toBe("block");
  });

  it("re-checks an untracked file after its content changes", () => {
    const readsNew = 'node -e "process.exit(require(\'fs\').readFileSync(\'.claude/hooks/new.mjs\', \'utf8\').includes(\'BAD\') ? 1 : 0)"';
    const repo = makeRepo({ test: readsNew, typecheck: pass });
    repos.push(repo);
    writeFileSync(join(repo, ".claude", "hooks", "new.mjs"), "// ok\n");
    expect(stop(repo).out).toBe("");
    writeFileSync(join(repo, ".claude", "hooks", "new.mjs"), "// BAD\n");
    expect(JSON.parse(stop(repo).out).decision).toBe("block");
  });

  it("re-checks a change that sorts after a diff of more than a megabyte", () => {
    const readsTest = 'node -e "process.exit(require(\'fs\').readFileSync(\'tests/x.mjs\', \'utf8\').includes(\'BAD\') ? 1 : 0)"';
    const repo = makeRepo({ test: readsTest, typecheck: pass });
    repos.push(repo);
    const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    mkdirSync(join(repo, "data"));
    mkdirSync(join(repo, "tests"));
    writeFileSync(join(repo, "data", "big.yaml"), "a: 1\n");
    writeFileSync(join(repo, "tests", "x.mjs"), "// ok\n");
    git("add", ".");
    git("-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", "big");
    // data/ sorts before tests/, so a diff cut off at 1 MB would never reach the change under tests/.
    writeFileSync(join(repo, "data", "big.yaml"), "b: 2\n".repeat(400_000));
    expect(stop(repo).out).toBe("");
    writeFileSync(join(repo, "tests", "x.mjs"), "// BAD\n");
    expect(JSON.parse(stop(repo).out).decision).toBe("block");
  });

  it("skips when nothing relevant changed, or when already continuing", () => {
    const repo = makeRepo({ test: fail, typecheck: fail });
    repos.push(repo);
    expect(stop(repo).out).toBe("");
    writeFileSync(join(repo, ".claude", "hooks", "a.mjs"), "// v2\n");
    expect(stop(repo, { stop_hook_active: true }).out).toBe("");
  });
});
