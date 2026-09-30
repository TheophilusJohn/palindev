#!/usr/bin/env node
// PreToolUse guard for Bash, Edit and Write.
// Blocks (exit 2, reason on stderr) when a command or file edit would expose secrets,
// read .env files, or force-push. See CLAUDE.md "Non-negotiable rules".

import { basename } from "node:path";

const SECRET_PATTERNS = [
  [/\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/, "a Stripe secret or restricted key"],
  [/\bpk_live_[A-Za-z0-9]{16,}/, "a Stripe live publishable key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, "a GitHub fine-grained token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
  [/\blin_api_[A-Za-z0-9]{20,}/, "a Linear API key"],
  [/\b(secret|ntn)_[A-Za-z0-9]{40,}/, "a Notion token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];

// Shell commands that would print or load env files or secret variables.
const BASH_RULES = [
  [/(^|[\s;&|(])(cat|less|more|head|tail|bat|nl|strings|grep|rg|awk|sed|cut|xxd|od|base64|source|\.)\s(?:[^;&|]*?[\s/"'=])?\.env(\.[\w.-]+)?(?=["'\s;&|)]|$)/, "reads a .env file"],
  [/(^|[\s;&|(])(printenv)(\s|$)/, "prints environment variables"],
  [/(^|[\s;&|(])env\s*($|[;&|>])/, "prints environment variables"],
  [/(echo|printf)[^;&|]*\$\{?[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)[A-Z0-9_]*\}?/, "prints a secret variable"],
  [/\bgit\s+push\b[^;&|]*(\s--force(-with-lease)?\b|\s-f\b)/, "force-pushes"],
  [/\bPALIN_ALLOW_PRODUCTION\b/, "tries to enable production access, which Palin never allows"],
];

function block(reason) {
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${reason}. See CLAUDE.md rules 3 and 4.\n`);
  process.exit(2);
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0); // not our business; never break the session on bad input
}

const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

if (tool === "Bash") {
  const cmd = String(ti.command ?? "");
  for (const [re, what] of BASH_RULES) if (re.test(cmd)) block(`this command ${what}`);
  for (const [re, what] of SECRET_PATTERNS) if (re.test(cmd)) block(`this command contains ${what}`);
  process.exit(0);
}

if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
  const file = String(ti.file_path ?? "").replace(/\\/g, "/");
  const name = basename(file);
  if (/^\.env(\..+)?$/.test(name)) block(`it writes to ${name}; secrets files are filled in by the maintainer only`);

  // Tests may hold fake secrets, but only on lines that say FAKE (see docs/HARNESS.md).
  const isTestFile = /(^|\/)(test|tests|__tests__|fixtures)\//.test(file) || /\.test\.[cm]?[jt]s$/.test(file);

  const texts = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])]
    .filter((t) => typeof t === "string");
  for (const text of texts) {
    for (const line of text.split("\n")) {
      for (const [re, what] of SECRET_PATTERNS) {
        if (!re.test(line)) continue;
        if (isTestFile && /FAKE/.test(line)) continue;
        block(`the new content for ${name} contains ${what} (test fakes must contain FAKE on the same line)`);
      }
    }
  }
  process.exit(0);
}

process.exit(0);
