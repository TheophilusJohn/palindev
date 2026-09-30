#!/usr/bin/env node
// PreToolUse guard for Bash, Edit and Write.
// Blocks (exit 2, reason on stderr) when a command or file edit would expose secrets,
// read .env or credential files, force-push, or push embargoed work (D22).
// See CLAUDE.md "Non-negotiable rules" and "Hooks in this repo".

import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const SECRET_PATTERNS = [
  [/\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/, "a Stripe secret or restricted key"],
  [/\bpk_live_[A-Za-z0-9]{16,}/, "a Stripe live publishable key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, "a GitHub fine-grained token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bASIA[0-9A-Z]{16}\b/, "a temporary AWS access key id"],
  [/secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9\/+]{40}(?![A-Za-z0-9\/+])/i, "an AWS secret access key"],
  [/session_?token["']?\s*[:=]\s*["']?[A-Za-z0-9\/+=]{100,}/i, "an AWS session token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
  [/\blin_api_[A-Za-z0-9]{20,}/, "a Linear API key"],
  [/\b(secret|ntn)_[A-Za-z0-9]{40,}/, "a Notion token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];

// Shell commands that would print or load env files or secret variables.
const BASH_RULES = [
  [/(^|[\s;&|(])(cat|less|more|head|tail|bat|nl|strings|grep|rg|awk|sed|cut|xxd|od|base64|source|\.)\s(?:[^;&|]*?[\s/"'=])?\.env(\.[\w.-]+)?(?=["'\s;&|)]|$)/, "reads a .env file"],
  // Any command that names an .aws or .ssh directory, whatever the command. Commands that only
  // mention the path (greps, commit messages) are blocked too; reword them instead (CLAUDE.md, Hooks).
  [/(?:^|[\s"'=:@<>(\/])\.(?:aws|ssh)(?=[\/\s"';&|)<>`]|$)/, "touches AWS or SSH credential files"],
  [/\$\{?AWS_(?:SHARED_CREDENTIALS|CONFIG)_FILE\b/, "reads AWS credential files"],
  [/(^|[\s;&|(<])(cat|less|more|head|tail|bat|nl|strings|grep|rg|awk|sed|cut|xxd|od|base64|cp|scp|openssl)\s[^;&|]*\.(pem|key|p12)(?=["'\s;&|)]|$)/, "reads a private key file"],
  // AWS CLI calls that print credentials or secrets, with or without global flags before the service.
  [/\baws(?:\s+[^\s;&|]+){0,6}?\s+(?:configure\s+(?:get|export-credentials)|sts\s+(?:get-session-token|get-federation-token|assume-ro(?:le|ot)[\w-]*)|sso\s+get-role-credentials|iam\s+(?:create-access-key|(?:create|reset)-service-specific-credential)|ecr(?:-public)?\s+get-login-password|eks\s+get-token|codeartifact\s+get-authorization-token|rds\s+generate-db-auth-token|secretsmanager\s+get-secret-value|ssm\s+get-parameters?(?:-by-path)?\s[^;&|\n]*--with-decryption|ec2\s+get-password-data)\b/, "prints AWS credentials or secrets"],
  // Embargoed results stay local until the vendor's reply window closes (D22).
  [/\bgit\s+push\b[^;&|]*(\bembargo\/|\s--all\b|\s--mirror\b)/, "pushes an embargoed branch or every branch (D22)"],
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
  // A bare `git push` pushes the checked-out branch, so refuse any push while an embargo branch is checked out (D22).
  if (/\bgit\b[^;&|]*\bpush\b/.test(cmd)) {
    const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const head = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8", timeout: 3000 });
    if (head.status === 0 && head.stdout.trim().startsWith("embargo/")) {
      block("this command pushes while an embargo/ branch is checked out (D22)");
    }
  }
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
