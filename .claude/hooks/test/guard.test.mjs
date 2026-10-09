import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const GUARD = join(import.meta.dirname, "..", "guard.mjs");
const HOME = "/Users/palin-test-home";

// Runs the guard outside any repo, so the developer's checked-out branch can't change a result.
function guard(tool_name, tool_input, extra = {}, extraEnv = {}) {
  const env = { ...process.env, HOME, ...extraEnv };
  delete env.CLAUDE_PROJECT_DIR;
  const started = performance.now();
  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name, tool_input, cwd: tmpdir(), ...extra }),
    encoding: "utf8",
    env,
    cwd: tmpdir(),
    timeout: 10_000,
  });
  return { status: r.status, stderr: r.stderr, ms: performance.now() - started };
}
const bash = (command, extra) => guard("Bash", { command }, extra);

// Commit and PR text the way Claude Code writes it: a quoted heredoc inside $(cat …).
const commitBody = (body) => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;
const prBody = (body) => `gh pr create --title "data(stripe): batch 1" --body "$(cat <<'EOF'\n${body}\nEOF\n)"`;

describe("guard: Bash commands it blocks", () => {
  const blocked = {
    "prints the environment": [
      "env>/tmp/e.txt",
      "env >| /tmp/e.txt",
      "echo `env` | grep T",
      "/usr/bin/env | grep T",
      "builtin set | grep T",
      "set>/tmp/x",
      "declare -p GITHUB_TOKEN",
      "declare | grep -i token",
      "typeset -p | grep -i token",
      "(set)",
      "{ set; } | grep -i token",
      "set 2>&1 | grep -i token",
      'echo "$(set)" | grep -i token',
      "env -v | grep -i token",
      "if true; then set; fi | grep TOKEN",
      "printenv PALIN_GUARD_CHECK",
      "env",
      "env | sort",
      "echo $GITHUB_TOKEN",
      "export -p | grep TOKEN",
      "set | grep -i token",
      "declare -x",
      "env -0 | tr '\\0' '\\n'",
    ],
    "reads a .env file": ["cat .env", "source .env.local", "grep KEY apps/site/.env"],
    "touches AWS or SSH credentials": ["ls ~/.aws", "grep Host ~/.ssh/config", 'cat "$AWS_SHARED_CREDENTIALS_FILE"', "cat ~/.aws*"],
    "prints AWS secrets": ["aws configure get aws_secret_access_key", "aws --profile x sts get-session-token"],
    "reads a private key": ["cat palin-test.pem", "openssl rsa -in app.key"],
    "pushes unsafely": ["git push --force", "git push -f origin feat/x", "git push origin embargo/2026-10-01-x", "git push --all"],
    "enables production": ["PALIN_ALLOW_PRODUCTION=1 pnpm harness run x"],
    "touches other credential stores": [
      "cat ~/.config/gh/hosts.yml",
      "grep -r token ~/.config/gh",
      'cat "$XDG_CONFIG_HOME/gh/hosts.yml"',
      'cat "$GH_CONFIG_DIR/hosts.yml"',
      "cd ~/.config && cat gh/hosts.yml",
      "ls ~/Library/Preferences/.wrangler/config",
      "cat ~/.config/.wrangler/config/default.toml",
      "cat $HOME/.wrangler/config/default.toml",
      "cat ~/.config/stripe/config.toml",
      "cat ~/.npmrc",
      "cat $HOME/.npmrc",
      'cat "$HOME"/.npmrc',
      'cat "${HOME}"/.npmrc',
      "cat ~//.npmrc",
      "cat /Users/someone/.npmrc",
      "npm config get //registry.npmjs.org/:_authToken",
      "npm config get _authToken",
      "cat ~/.netrc",
      "cat ~/.netrc*",
      "cat ~/{.netrc,.git-credentials}",
      "cat ~/.git-credentials",
      "cat ~/.config/git/credentials",
      "cat ~/.docker/config.json",
      'cat "$DOCKER_CONFIG/config.json"',
      "kubectl --kubeconfig ~/.kube/config get pods",
      "echo $KUBECONFIG",
      "cat ~/.pypirc",
      "cat ~/.claude.json",
      "ls ~/.claude/backups/.claude.json.backup.1",
      "cat ~/.claude/backups/*",
      "grep -r token ~/.claude/backups",
      "cat ~/.claude/.credentials.json",
    ],
    "touches an MCP config": [
      "cat ~/Library/Application\\ Support/Claude/claude_desktop_config.json",
      "cat ~/.cursor/mcp.json",
      "cat ~/.config/*/hosts.yml",
      "cat ~/.config/{gh,foo}/*.yml",
    ],
    "searches a directory of credential stores, with any pattern or trailing arguments": [
      'grep -rniE "api_key|token|secret" ~ 2>/dev/null',
      "rg --hidden -n 'oauth_token|api_key' ~",
      "grep -rE 'oauth_token|password' ~/.config",
      "grep -r 'token\\|secret' ~",
      "grep -r --regexp=token ~",
      "rg -l oauth_token ~ --hidden",
      "grep -r token ~ --include='*.yml'",
      "grep -r token ~ > /tmp/hits.txt",
      "grep -r token ~ 2> /dev/null",
      "grep -rn oauth_token ~/.config ~/dev/palin",
      "grep -r token ~/.[!.]*",
      "grep -r token ~/Library/Application\\ Support/Claude",
      'grep -r token "$HOME"',
      "grep -r token /home/someone",
      "grep -r token /root",
    ],
    "searches a directory of credential stores": [
      "grep -r oauth_token ~/.config/*",
      "grep -rn token ~/.config/*/",
      "rg token ~/.config/**",
      "grep -r password ~/*",
      "grep -rs token ~/.*",
      "grep -r accessToken ~/.claude/*",
      'grep -r token "$HOME"/.config/*',
      "grep -r api_token ~/Library",
      "grep -r x ~ 2>/dev/null | head",
      "grep -r oauth_token ~/.config",
      "grep -rn api_key ~/.config/",
      "grep -r accessToken ~/.claude",
      "rg -n token ~/Library/Preferences",
      "grep -r password ~",
    ],
    "prints a stored credential": [
      "claude mcp get github",
      "gh auth token",
      "gh auth status --show-token",
      "gh auth status -h github.com -t",
      "gh auth status -th github.com",
      "printf 'protocol=https\\nhost=github.com\\n' | gh auth git-credential get",
      "git credential fill",
      "git -C /tmp credential fill",
      "printf 'host=github.com\\n' | git credential-osxkeychain get",
      "printf 'host=github.com\\n' | git-credential-osxkeychain get",
      "security find-generic-password -w -s gh:github.com",
      "security 2>&1 >/dev/null find-generic-password -ga gh:github.com",
      "security dump-keychain",
      "docker-credential-desktop list",
      "npm token list",
      "npx wrangler auth token",
      "wrangler auth token --json",
      "kubectl config view --raw",
    ],
    "runs the Stripe CLI after a comment that ends in a backslash": [
      "ls # list files \\\nstripe login",
      "cd /tmp && \\\n# load fixtures into test mode \\\nstripe fixtures seed.json",
      "echo hi \\\n  # comment mid \\\nstripe login",
      "pnpm validate # then; git commit -F - <<'EOF'\nstripe login\nEOF",
      "printf '%s\\n' '\n| id |\n| cus_1 |' | xargs -n1 stripe customers retrieve",
    ],
    "pushes with git's own options first, or forces another way": [
      "git -C /tmp/x push origin embargo/2026-10-01-x",
      "git -C /tmp/x push --force origin main",
      "git -C . push --all origin",
      "git --no-pager push --force-with-lease",
      "git -c push.default=current push --force",
      "git \\\n  -C . \\\n  push --force",
      "git push -fu origin feat/x",
      "git push -uf origin feat/x",
      "git push origin +HEAD:main",
      "git push origin 'refs/heads/*'",
      "git push origin 'refs/*:refs/*'",
      "bash -c 'git push --force'",
      "\\git push --force",
      "Git push --force",
      "\\git push --all",
      'git push -o "ci #1" --force',
      "git push origin main -o $'it\\'s' \\\n  --force",
      "git commit -m \"$(cat <<'EOF'\nmsg\n)\"\ngit push --force\nEOF",
    ],
    "runs the Stripe CLI, past a literal-text exemption": [
      "git commit -F - <<<'wip'\nstripe login",
      "gh pr comment 5 --body-file - <<<'LGTM'\nstripe listen",
      "git commit -m \"$(cat <<'EOF'\nmsg\nEOF)\" && stripe login",
      "git commit -m \"$(cat <<'EOF'\nsee pnpm validate \\\nEOF\n)\"\nstripe login",
      "bash <<'SH' && git commit -F - <<'EOF'\nstripe login\nSH\nmsg\nEOF",
      "cat <<X; git commit -F - <<'EOF'\n$(stripe login)\nX\nmsg\nEOF",
      "git commit -F <(bash <<'EOF'\nstripe login\nEOF\n)",
      "git commit -m \"fix <<'EOF'\nbody\n\" && stripe login",
      'echo "a\n| x | y |"; stripe login',
      'gh pr create --title x --body "\n| `stripe login` |\n"',
      "git commit -F - <<'EOF'\nmsg\nstripe login",
    ],
    "runs the Stripe CLI": [
      "if false; then :; elif true; then stripe login; fi",
      "DIR=$(dirname $(pwd)) stripe listen",
      "</dev/null stripe listen",
      "2>/dev/null stripe config --list",
      "stripe",
      "stripe customers list",
      "stripe listen 2>&1",
      "/opt/homebrew/bin/stripe login",
      "$HOME/bin/stripe login",
      "node_modules/.bin/stripe login",
      "./stripe listen",
      "/usr/bin/env stripe login",
      "sh -c 'stripe login'",
      'bash -lc "stripe listen"',
      "sh -c stripe",
      "bash -o pipefail -c 'stripe customers list | head'",
      "bash --login -c 'stripe login'",
      "bash -c -- 'stripe login'",
      "fish -c 'stripe login'",
      "STRIPE_API_KEY=x stripe charges list",
      "npx stripe customers list",
      "pnpm dlx stripe",
      "pnpm --silent dlx stripe",
      "npm exec -- stripe login",
      "echo y | stripe logout",
      "echo y |stripe logout",
      "false||stripe login",
      "cat ids.txt | stripe customers retrieve",
      "cat ids.txt \\\n  | stripe fixtures -",
      "(stripe login)",
      "$(stripe)",
      "cd /tmp && stripe config --list",
      "ls; stripe",
      "x=$(stripe config --list)",
      '"$(which stripe)" login',
      "$(command -v stripe) customers list",
      "xargs -n 1 stripe < ids.txt",
      "ls -1 ids | xargs -I {} stripe customers retrieve {}",
      "sudo stripe login",
      "sudo -u admin stripe login",
      "env -i stripe login",
      "env -u STRIPE_API_KEY stripe login",
      "timeout 5s stripe listen",
      "timeout -s KILL 5 stripe listen",
      "timeout -k 5 10 stripe listen",
      "watch stripe events list",
      'eval "stripe login"',
      "{ stripe login; }",
      "{\nstripe login\n}",
      '"stripe" login',
      "if true; then stripe login; fi",
      "git status\nstripe login",
      "find fixtures -name '*.json' -exec stripe fixtures {} \\;",
      "docker run --rm -it stripe/stripe-cli login",
      "bash <<'EOF'\nstripe login\nEOF",
      "cat <<EOF\n$(stripe config --list)\nEOF",
      "git commit -m \"$(bash <<'EOF'\nstripe login\nEOF\n)\"",
      "git commit -F - <<'EOF' | bash\nstripe login\nEOF",
      `${commitBody("data(stripe): add refunds.create")} && stripe login`,
    ],
  };
  for (const [what, commands] of Object.entries(blocked)) {
    for (const command of commands) {
      it(`${what}: ${JSON.stringify(command)}`, () => {
        const r = bash(command);
        expect(r.status, r.stderr).toBe(2);
        expect(r.stderr).toMatch(/^Blocked by \.claude\/hooks\/guard\.mjs: /);
      });
    }
  }

  it("blocks a secret in a command", () => {
    expect(bash('curl -H "Authorization: Bearer ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE00"').status).toBe(2);
  });
});

describe("guard: Bash commands it allows", () => {
  const allowed = [
    'git commit -m "data(stripe): add refunds.create"',
    'git commit -m "fix(hooks): block the Stripe CLI"',
    'git commit -m "fix(harness): redact the npm _authToken key in traces"',
    commitBody("data(stripe): add refunds.create\n\nProvider `stripe` terms are not green; stripe stays red.\n| stripe | 3 |\nstripe login is never run."),
    prBody("## Summary\n\n| provider | records |\n| --- | --- |\n| stripe | 10 |\n\n`stripe refunds create` is documented only."),
    "git commit -F - <<'EOF'\nstripe: add refunds\nEOF",
    "git add -A && git commit -m \"$(cat <<'EOF'\nstripe & github\nEOF\n)\"",
    'gh pr create --title "data(stripe): refunds & payouts | batch 1" --body "$(cat <<\'EOF\'\n| stripe | 3 |\n`stripe refunds create` is documented.\nEOF\n)"',
    "git --no-pager commit -F - <<'EOF'\nstripe login is never run\nEOF",
    'GIT_AUTHOR_NAME="Theo J" git commit -F - <<\'EOF\'\nstripe stays red\nEOF',
    "git tag -a v0.1 -F - <<'EOF'\nstripe stays red\nEOF",
    "git commit -F - <<'EOF' 2>&1\nstripe stays red\nEOF",
    "git commit -F - <<'MSG-1'\nstripe stays red\nMSG-1",
    'echo "| stripe | 10 |" >> /tmp/table.md',
    "node -e 'const { stripe } = require(\"./x\")'",
    "grep -E github\\|stripe docs",
    "cat > notes.md <<'EOF'\n| stripe | care |\nEOF",
    "git add \\\n  data/stripe \\\n  tests/actions/stripe",
    "ls data/stripe",
    "pnpm validate data/stripe/refunds.create.yaml",
    "grep -rn stripe docs",
    'grep -rnE "github|stripe" docs',
    "rg 'slack|notion|stripe' docs",
    "pnpm test -- -t 'github|stripe'",
    "case $p in github|stripe) echo yes;; esac",
    "echo '{\"stripe\": \"red\"}' | jq .",
    "node -e 'console.log({\"stripe\": 1})'",
    "git switch -c data/stripe-batch-1",
    "git log --grep stripe",
    "which stripe",
    "command -v stripe",
    'p=$(which stripe); echo "$p"',
    "brew info stripe/stripe-cli/stripe",
    "gh release list -R stripe/stripe-cli --limit 5",
    "docker run -p 12111:12111 stripe/stripe-mock:latest",
    "stripe-mock --http-port 12111",
    "for p in stripe github; do echo $p; done",
    'echo "Stripe is red"',
    "xargs -I {} pnpm validate {}",
    "sudo -u palin ls",
    "timeout -s KILL 60 pnpm test",
    "exec -a myname node x.js",
    "find data -name '*.yaml' -exec pnpm validate {} +",
    "bash -o pipefail -c 'pnpm test | tee /tmp/out.txt'",
    "npm exec -- vitest run",
    "pnpm --filter @palindev/schema exec vitest run",
    "cat > /tmp/a.py <<'EOF'\ndef _auth(self):\n    return None\nEOF",
    "grep -rn _auth packages",
    "ls .wrangler/state",
    "npx wrangler whoami",
    "kubectl config view",
    "cat .npmrc",
    "cat packages/schema/.npmrc",
    "ls -la ~/.config",
    "ls ~/.claude/projects/x/memory",
    "rg -n hooks ~/.claude/settings.json",
    "grep -rn stripe ~/dev/palin/docs",
    "grep -rn stripe ~/dev/palin/docs/*",
    "grep -n x ~/*.md",
    "rg -n '/Users/theojohn' docs",
    "rg '~/.claude' docs",
    'grep -rn "$HOME" scripts',
    "claude mcp list",
    "cat .mcp.json",
    "set -euo pipefail",
    "export FOO=1 && pnpm test",
    "git push -u origin data/github-batch-1\nrm -f /tmp/pr-body.md",
    "git push -u origin data/stripe-batch-1",
    "git push --follow-tags",
    "git push origin --delete feat/x",
    "git push origin feat/x # +1",
    "git -C ../palin-private push",
    "rg -n '~/Library'",
    "rg -n '~/.claude' docs",
    'grep -rn "~/.claude"',
    "rg -n '$HOME'",
    "git diff --cached | grep -c '~'",
    'grep -q "^~" ~/.bashrc',
    "rg --files ~/.claude/skills",
    "ls ~ | grep x",
    'rg -n "stripe login|stripe listen" docs',
    "pnpm test:hooks -- -t 'github|stripe refunds'",
    'git log --oneline -E --grep "slack|stripe terms"',
    "git commit -F - <<'EOF' && git log --oneline -1\nstripe refunds create is documented only.\nEOF",
    "git commit -q -F - <<'EOF' >/dev/null\nstripe refunds create\nEOF",
    "git -c user.name='Theo J' commit -m \"$(cat <<'EOF'\nstripe refunds create\nEOF\n)\"",
    "git commit -F - <<\\EOF\nstripe refunds create\nEOF",
    commitBody("docs: table\n\n| set | x |\n| env | y |\n| export | z |"),
    'git commit -m "fix #12" \\\n  --no-verify',
    "echo a#b \\\n  stripe-mock",
    "declare -a arr=(a b)",
    "typeset -i n=0",
    "env FOO=1 pnpm test",
    "env -u X node x.mjs",
    "set -x",
    "gh pr list",
    "gh auth status",
    "gh auth status -h github.com",
    "gh auth status --hostname github.com",
    "git -C ../palin-private status",
    "pnpm test",
    "git push origin feat/x",
    "git status",
    "node .claude/hooks/guard.mjs < input.json",
  ];
  for (const command of allowed) {
    it(JSON.stringify(command), () => {
      const r = bash(command);
      expect(r.status, r.stderr).toBe(0);
    });
  }
});

// Claude Code lets a command through when a hook times out, so slow matching is a hole.
describe("guard: answers quickly, and blocks when it can't", () => {
  const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("\n");
  const fast = [
    ["5000 lines of prose", `cat <<'EOF'\n${lines(5000, () => "a line of ordinary text, with words = values and paths/like/this")}\nEOF`, 0],
    ["40 quoted assignments, then a force push", `cat > x.sh <<'EOF'\n${lines(40, (i) => `VAR_${i}="value_${i}"`)}\nEOF\ngit push --force origin main`, 2],
    ["40 quoted assignments on one line", `${lines(1, () => Array.from({ length: 40 }, (_, i) => `A${i}='v'`).join(" "))} ls`, 0],
    ["10000 unquoted assignments", `cat > x.sh <<'EOF'\n${lines(10000, (i) => `VAR_${i}=value_${i}`)}\nEOF`, 0],
    ["20000 blank lines", `echo start${"\n".repeat(20000)}echo end`, 0],
    ["2000 sudo -u pairs", `sudo ${"-u v ".repeat(2000)}ls`, 0],
    ["200 sudo -u sudo pairs", `sudo ${"-u sudo ".repeat(200)}ls`, 0],
    ["200 timeout -s timeout pairs", `timeout ${"-s timeout ".repeat(200)}5 ls`, 0],
    ["5000 slashes after a home search", `grep a ~${"/".repeat(5000)}x`, 0],
    ["200 long git options", `git ${"--aa ".repeat(200)}status`, 0],
    ["200 spaced redirects in a search", `grep x ${"> a ".repeat(200)}docs`, 0],
    ["set then 200 redirects", `set ${">".repeat(200)} a b`, 0],
    ["5000 commit heredocs", lines(5000, () => "git commit -F - <<'EOF'\nmsg\nEOF"), 0],
    ["20000 unterminated heredoc heads", lines(20000, () => "git commit -F - <<'EOF'"), 0],
  ];
  for (const [what, command, status] of fast) {
    it(what, () => {
      const r = bash(command);
      expect(r.status, r.stderr).toBe(status);
      expect(r.ms).toBeLessThan(2000);
    });
  }

  it("blocks a command it can't check in time", () => {
    const r = guard("Bash", { command: lines(20000, () => "an ordinary line of text") }, {}, { PALIN_GUARD_LIMIT_MS: "1" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("couldn't check this command in time");
  });

  it("can't have its time limit raised", () => {
    const r = guard("Bash", { command: "ls" }, {}, { PALIN_GUARD_LIMIT_MS: "999999" });
    expect(r.status).toBe(0);
    const slow = guard("Bash", { command: "echo x ".repeat(150_000) }, {}, { PALIN_GUARD_LIMIT_MS: "999999" });
    expect(slow.status).toBe(2);
    expect(slow.ms).toBeLessThan(8000);
  });
});

describe("guard: file edits", () => {
  it("blocks writing a .env file, in any case", () => {
    expect(guard("Write", { file_path: "/repo/.env.local", content: "X=1" }).status).toBe(2);
    expect(guard("Write", { file_path: "/repo/.ENV", content: "X=1" }).status).toBe(2);
  });

  it("blocks a secret outside tests, and allows a FAKE one in tests", () => {
    const line = "const key = 'sk_test_FAKE0000000000000000';";
    expect(guard("Write", { file_path: "/repo/packages/core/src/a.ts", content: line }).status).toBe(2);
    expect(guard("Write", { file_path: "/repo/packages/core/test/a.test.ts", content: line }).status).toBe(0);
  });

  it("checks every MultiEdit edit", () => {
    const edits = [{ new_string: "ok" }, { new_string: "AKIAFAKEFAKEFAKEFAKE" }];
    expect(guard("MultiEdit", { file_path: "/repo/packages/core/src/a.ts", edits }).status).toBe(2);
  });

  it("checks NotebookEdit sources and paths", () => {
    const new_source = "key = 'sk_live_FAKE0000000000000000'";
    expect(guard("NotebookEdit", { notebook_path: "/repo/notes/a.ipynb", new_source }).status).toBe(2);
    expect(guard("NotebookEdit", { notebook_path: "/repo/notes/a.ipynb", new_source: "print(1)" }).status).toBe(0);
    expect(guard("NotebookEdit", { notebook_path: "/repo/.env", new_source: "X=1" }).status).toBe(2);
  });

  const credentialFiles = [
    `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`,
    `${HOME}/.cursor/mcp.json`,
    `${HOME}/.npmrc`,
    `${HOME}//.npmrc`,
    `${HOME}/x/../.npmrc`,
    `${HOME}/.NPMRC`,
    "~/.npmrc",
    `${HOME}/.netrc`,
    `${HOME}/.git-credentials`,
    `${HOME}/.config/git/credentials`,
    `${HOME}/.pypirc`,
    `${HOME}/.claude.json`,
    `${HOME}/.claude/backups/.claude.json.backup.1`,
    `${HOME}/.claude/.credentials.json`,
    `${HOME}/.docker/config.json`,
    `${HOME}/.config/gh/hosts.yml`,
    `${HOME}/.config/stripe/config.toml`,
    `${HOME}/.config/.wrangler/config/default.toml`,
    `${HOME}/Library/Preferences/.wrangler/config/default.toml`,
    `${HOME}/.kube/config`,
    `${HOME}/.aws/credentials`,
    `${HOME}/.AWS/credentials`,
    `${HOME}/.ssh/config`,
  ];
  for (const file_path of credentialFiles) {
    it(`blocks writing ${file_path}`, () => {
      expect(guard("Write", { file_path, content: "x" }).status).toBe(2);
    });
  }

  it("allows a project .npmrc and ordinary files", () => {
    expect(guard("Write", { file_path: "/repo/.npmrc", content: "engine-strict=true" }).status).toBe(0);
    expect(guard("Edit", { file_path: "/repo/data/stripe/refunds.create.yaml", new_string: "x" }).status).toBe(0);
  });
});

describe("guard: pushes from an embargo branch (D22)", () => {
  const makeRepo = (branch) => {
    const dir = mkdtempSync(join(tmpdir(), "palin-guard-"));
    const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", branch);
    git("-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "--allow-empty", "-m", "x");
    return { dir, git };
  };
  const emb = makeRepo("embargo/2026-10-01-x");
  const main = makeRepo("main");
  afterAll(() => [emb, main].forEach((r) => rmSync(r.dir, { recursive: true, force: true })));

  it("blocks a bare push while an embargo/ branch is checked out", () => {
    expect(bash("git push", { cwd: emb.dir }).status).toBe(2);
    expect(bash("\\git push", { cwd: emb.dir }).status).toBe(2);
    expect(bash("git -C . push", { cwd: emb.dir }).status).toBe(2);
    expect(bash("git \\\n  push", { cwd: emb.dir }).status).toBe(2);
    expect(bash("bash -c 'git push -u origin HEAD'", { cwd: emb.dir }).status).toBe(2);
    expect(bash('git commit -m "fix: x\n\n#12" && git push', { cwd: emb.dir }).status).toBe(2);
    expect(bash("git --attr-source HEAD push", { cwd: emb.dir }).status).toBe(2);
    expect(bash("git push>/tmp/o.txt", { cwd: emb.dir }).status).toBe(2);
  });

  it("blocks a push that moves to an embargo checkout first", () => {
    const parent = dirname(emb.dir);
    const name = basename(emb.dir);
    expect(bash(`cd ${emb.dir} && git push -u origin HEAD`, { cwd: main.dir }).status).toBe(2);
    expect(bash(`git -C ${emb.dir} push -u origin HEAD`, { cwd: main.dir }).status).toBe(2);
    expect(bash(`git -C ${parent} -C ${name} push`, { cwd: main.dir }).status).toBe(2);
    expect(bash(`if true; then cd ${emb.dir} && git push; fi`, { cwd: main.dir }).status).toBe(2);
    expect(guard("Bash", { command: `cd "$HOME"/${name} && git push` }, { cwd: main.dir }, { HOME: parent }).status).toBe(2);
    expect(bash(`GIT_DIR=${emb.dir}/.git git push`, { cwd: main.dir }).status).toBe(2);
    expect(bash(`git --git-dir=${emb.dir}/.git push`, { cwd: main.dir }).status).toBe(2);
    expect(bash("git push", { cwd: 5 }).status).toBe(2);
    expect(bash(`cd ${main.dir} && git push -u origin HEAD`, { cwd: main.dir }).status).toBe(0);
  });

  it("blocks a push it can't place while a worktree of the repo is on an embargo/ branch", () => {
    const repo = makeRepo("main");
    const wt = `${repo.dir}-wt`;
    repo.git("worktree", "add", "-q", "-b", "embargo/2026-10-02-y", wt);
    try {
      expect(bash(`(cd /tmp && ls) && cd ../${basename(wt)} && git push`, { cwd: repo.dir }).status).toBe(2);
      expect(bash("cd $SOMEWHERE && git push", { cwd: repo.dir }).status).toBe(2);
      expect(bash(`cd ${wt} && git push`, { cwd: repo.dir }).status).toBe(2);
      expect(bash("git push -u origin main", { cwd: repo.dir }).status).toBe(0);
    } finally {
      rmSync(wt, { recursive: true, force: true });
      rmSync(repo.dir, { recursive: true, force: true });
    }
  });

  it("finds the push past stray quotes in an earlier heredoc body", () => {
    const notes = "cat > /tmp/notes.md <<'EOF'\nDon't push yet.\nEOF\n";
    expect(bash(`${notes}git commit -am 'fix #12' && git push --force`, { cwd: main.dir }).status).toBe(2);
    expect(bash(`${notes}git commit -am 'fix #12' && git push`, { cwd: emb.dir }).status).toBe(2);
    expect(bash("node - <<'EOF'\nconst q = /'/;\nEOF\necho 'step #2' && git push origin embargo/2026-10-01-x", { cwd: main.dir }).status).toBe(2);
  });

  it("finds the repo the way git does", () => {
    const parent = mkdtempSync(join(tmpdir(), "palin-guard-layouts-"));
    try {
      // A symlink into the embargo checkout, an empty .git directory inside it, and a bare repo.
      symlinkSync(emb.dir, join(parent, "link"));
      mkdirSync(join(emb.dir, "sub", ".git"), { recursive: true });
      spawnSync("git", ["init", "-q", "--bare", "-b", "embargo/2026-10-03-z", join(parent, "bare.git")]);
      expect(bash("git push", { cwd: join(parent, "link") }).status).toBe(2);
      expect(bash("git push", { cwd: join(emb.dir, "sub") }).status).toBe(2);
      expect(bash(`cd ${join(parent, "bare.git")} && git push origin HEAD`, { cwd: main.dir }).status).toBe(2);
    } finally {
      rmSync(join(emb.dir, "sub"), { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("checks git -C and globbed moves it can't place", () => {
    const repo = makeRepo("main");
    const wt = `${repo.dir}-wt`;
    repo.git("worktree", "add", "-q", "-b", "embargo/2026-10-04-w", wt);
    try {
      expect(bash(`git -c 'user.name=A B' push origin x; git --attr-source HEAD -C ${wt} push`, { cwd: repo.dir }).status).toBe(2);
      expect(bash(`cd ${dirname(wt)}/${basename(wt).slice(0, -1)}[${basename(wt).slice(-1)}] && git push`, { cwd: repo.dir }).status).toBe(2);
    } finally {
      rmSync(wt, { recursive: true, force: true });
      rmSync(repo.dir, { recursive: true, force: true });
    }
  });

  it("allows git commands there that aren't pushes", () => {
    expect(bash("git commit -F - <<'EOF'\nkeep local, do not push\nEOF", { cwd: emb.dir }).status).toBe(0);
    expect(bash('git commit -m "data(github): correct refs.delete, do not push until the window closes"', { cwd: emb.dir }).status).toBe(0);
    expect(bash("git stash push -m 'wip records'", { cwd: emb.dir }).status).toBe(0);
    expect(bash("git config --get push.default", { cwd: emb.dir }).status).toBe(0);
    expect(bash("git log --oneline --grep push", { cwd: emb.dir }).status).toBe(0);
    expect(bash("git add data\n# local only: never git push from here (D22)\ngit status", { cwd: emb.dir }).status).toBe(0);
  });

  it("allows a push from another branch", () => {
    emb.git("switch", "-q", "-c", "feat/x");
    expect(bash("git push", { cwd: emb.dir }).status).toBe(0);
  });
});

describe("guard: other input", () => {
  it("ignores other tools and bad JSON", () => {
    expect(guard("Read", { file_path: "/repo/.env" }).status).toBe(0);
    const r = spawnSync(process.execPath, [GUARD], { input: "not json", encoding: "utf8" });
    expect(r.status).toBe(0);
  });
});
