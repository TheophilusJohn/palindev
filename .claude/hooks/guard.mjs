#!/usr/bin/env node
// PreToolUse guard for Bash, Edit, Write, MultiEdit and NotebookEdit.
// Blocks (exit 2, reason on stderr) when a command or file edit would expose secrets,
// read .env or credential files, run the Stripe CLI, force-push, or push embargoed work (D22).
// See CLAUDE.md "Non-negotiable rules" and "Hooks in this repo".

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, posix, resolve } from "node:path";
import vm from "node:vm";

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

// Where a command name can start: the beginning; after ; & newline or a backtick; after a | that
// isn't glued to a word or escaped (so `grep -E "github|stripe"` is an argument); after a { that opens
// a group; inside $( <( >(, find -exec, sh -c or eval; then any subshell parens. Then redirections, env
// assignments and wrappers (sudo -u x, xargs -I {}, env, timeout, npx, pnpm dlx…). Separators are
// spaces and tabs only (a newline is its own start), each alternative starts with a different
// character, and an option's value can't be another wrapper, so there is one way to match. A word in
// arguments (`ls data/stripe`, `git commit -m "data(stripe): …"`) is not at a command start. Splitting
// the name with quotes or a backslash, gluing the pipe to a word (`ids|stripe`), or reaching it through
// a variable, an alias or `| sh` still gets past it: a guardrail, not a sandbox.
const CMD_START = String.raw`(?:(?:^|[;&\n\`]|(?<![\w\\])\||\{(?=\s)|[$<>]\(|[ \t]-(?:exec|ok)(?:dir)?(?=[ \t]))[ \t]*|\b(?:ba|z|da|k|fi)?sh[ \t]+(?:-[a-zA-Z]*o[ \t]+\w[\w-]*[ \t]+|-[a-zA-Z]+[ \t]+|--[\w-]+[ \t]+)*-[a-bd-zA-Z]*c[a-zA-Z]*[ \t]+(?:--[ \t]+)?(?:['"][ \t]*)?|\beval[ \t]+(?:['"][ \t]*)?)(?:\([ \t]*)*`;
const WRAPPERS = String.raw`(?:sudo|doas|builtin|exec|nohup|time|nice|env|xargs|npx|pnpx|bunx|stdbuf|caffeinate|watch|coproc|unbuffer|parallel|then|do|else|elif|if|while|until|command(?![ \t]+-[vV]))`;
const WRAPPER_PATH = String.raw`(?:[^\s;&|'"\`()=<>]*\/)?`;
const IS_WRAPPER = String.raw`${WRAPPER_PATH}(?:${WRAPPERS}|g?timeout)[ \t]`;
const NOT_WRAPPER = String.raw`(?![\d-]|${IS_WRAPPER})`;
const CMD_PREFIX = String.raw`(?:![ \t]*|\d*[<>]{1,2}&?[ \t]*[^\s;&|<>()]+[ \t]+|[A-Za-z_][A-Za-z0-9_]*=(?:'[^'\n]*'|"[^"\n]*"|\$\((?:[^()\n]|\([^()\n]*\))*\)|\`[^\`\n]*\`|[^\s;&|'"\`()])*[ \t]+|${WRAPPER_PATH}${WRAPPERS}(?:[ \t]+(?:-[IdaEeLnPsugpCDhrtSk][ \t]+${NOT_WRAPPER}[^\s;&|]+|-[^\s;&|]*|\d+))*[ \t]+|(?:pnpm|npm|yarn)(?:[ \t]+-[\w-]+)*[ \t]+(?:dlx|exec|x)(?:[ \t]+--)?[ \t]+|${WRAPPER_PATH}g?timeout(?:[ \t]+-[sk][ \t]+(?!${IS_WRAPPER})[^\s-]\S*|[ \t]+-\S+)*[ \t]+\S+[ \t]+)*`;
// The name itself: bare, or after an explicit path (/…, ~/…, $HOME/…, ./…, ../…, or a bin/ or .bin/
// directory), or as $(which name), with quotes only if they pair up. A name followed by | or } is a
// table cell or a destructured key (bare, it would only print help).
const SEG = String.raw`[^\s;&|'"\`()]*`;
const NAME_PATH = String.raw`(?:(?:~|\$\{?HOME\}?|\.{1,2})?\/(?:${SEG}\/)?|(?:${SEG}\/)?\.?bin\/)?`;
const command = (name) =>
  new RegExp(
    String.raw`${CMD_START}${CMD_PREFIX}(['"]?)(?:${NAME_PATH}${name}|(?:\$\(|\`)[ \t]*(?:which|command[ \t]+-v|type[ \t]+-p)[ \t]+${name}[ \t]*[)\`])\1(?=[\s;&|<>)]|$)(?![ \t]*[|}])`,
  );

// What the shell would run, for the rules marked "exec": line continuations joined (a trailing
// backslash in a comment or in single quotes doesn't continue), the literal bodies of quoted heredocs
// that feed git commit, tag or merge, or gh pr, issue or release skipped (commit and PR text, never
// run), and pipes in markdown table rows defused. A head line must hold exactly one heredoc, outside
// any comment, and no here-string or process substitution; a chain after the delimiter may not pipe
// or redirect input. The body ends at the first line that is the delimiter (or the delimiter and a
// closing paren), or, inside $( ), at a line with an unmatched ")": never later than zsh or a current
// bash ends it. (bash 3.2 can also end it at a ")" hidden by a quoted "(", which isn't followed.) After
// an unterminated heredoc, nothing more is skipped. Linear.
const QWORD = String.raw`(?:[^\s;&|'"\`()$\\<>]|'[^'\n]*'|"[^"\n$\`\\]*")+`;
const LITERAL_HEAD = new RegExp(
  String.raw`(?:^|[;&])[ \t]*(?:[A-Za-z_]\w*=(?:${QWORD})?[ \t]+)*(?:git(?:[ \t]+(?:-[cC][ \t]+${QWORD}|--no-pager))*[ \t]+(?:commit|tag|merge)|gh[ \t]+(?:pr|issue|release)[ \t]+[\w-]+)\b(?:[^\n|;&\`$"'\\<>]|\\[^\n]|'[^'\n]*'|"(?:[^"\n$\`\\]|\\[^\n]|\$(?!\())*"|\$(?!\()|[<>](?![(<]))*?(?:"?\$\([ \t]*cat[ \t]+(?:-[ \t]+)?)?(?<!<)<<-?[ \t]*(?:(['"])([\w.-]+)\1|\\([\w.-]+))(?:[ \t]+\d*>{1,2}&?[ \t]*[^\s;&|<>()]+)*[ \t]*(?:(?:&&|\|\||;)[^|<\n]*)?$`,
);
// Scans one physical line, starting in quote state q ("", "'", '"' or "$'"): whether it ends in a line
// continuation, where an unquoted comment starts, and which quote it leaves open.
function scanLine(s, q = "") {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") q = "";
    } else if (q === "$'") {
      if (c === "\\") i++;
      else if (c === "'") q = "";
    } else if (c === "\\") {
      if (i === s.length - 1) return { q, cont: true, comment: -1 };
      i++;
    } else if (q === '"') {
      if (c === '"') q = "";
    } else if (c === "$" && s[i + 1] === "'") {
      q = "$'";
      i++;
    } else if (c === "'" || c === '"') q = c;
    else if (c === "#" && (i === 0 || " \t;&|(".includes(s[i - 1]))) return { q, cont: false, comment: i };
  }
  return { q, cont: false, comment: -1 };
}
const isTerminator = (line, delim) => {
  const t = line.trim();
  return t === delim || (t.startsWith(delim) && /^[ \t]*\)/.test(t.slice(delim.length)));
};
// bash 3.2 ends a heredoc inside $( ) at a line with an unmatched ")", so such a line ends the skip too.
const closesParen = (line) => {
  let depth = 0;
  for (const c of line) if (c === "(") depth++;
  else if (c === ")" && --depth < 0) return true;
  return false;
};
function execView(cmd) {
  const raw = cmd.split("\n");
  const out = [];
  let skipping = true;
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    let st = scanLine(line);
    if (st.cont) {
      const parts = [];
      while (st.cont && i + 1 < raw.length) {
        parts.push(line.slice(0, -1));
        line = raw[++i];
        st = scanLine(line, st.q);
      }
      parts.push(line);
      line = parts.join(" ");
    }
    if (/^[ \t]*\|.*\|[ \t\r]*$/.test(line)) {
      out.push(line.replace(/\|/g, "¦"));
      continue;
    }
    out.push(line);
    if (!skipping) continue;
    const comment = scanLine(line).comment;
    const code = comment >= 0 ? line.slice(0, comment) : line;
    const head = LITERAL_HEAD.exec(code);
    if (!head || code.match(/(?<!<)<<(?!<)/g).length !== 1) continue;
    const delim = head[2] ?? head[3];
    const inComsub = /\$\([ \t]*cat/.test(head[0]);
    let end = i + 1;
    while (end < raw.length && !isTerminator(raw[end], delim) && !(inComsub && closesParen(raw[end]))) end++;
    if (end === raw.length) skipping = false; // unterminated: check the rest, and skip nothing more
    else i = end - 1; // skip the body; the terminator line and the rest are checked
  }
  return out.join("\n");
}

// git (also as \git, Git or a path), its own options (-C <dir>, -c <k=v>, --git-dir <dir>, --no-pager…),
// then the push subcommand. Group 1 holds the options, so the -C directories can be read back. A value
// never starts with "-" and an option name starts with a word character, so there is one way to match.
const GIT_PUSH = String.raw`(?:^|[\s;&|(\`\/'"\\])[gG][iI][tT]((?:[ \t]+(?:-[cC][ \t]+(?![-\s])(?:[^\s'"]|'[^'\n]*'|"[^"\n]*")+|--(?:git-dir|work-tree|namespace|exec-path|config-env)[ \t]+(?![-\s])\S+|--?(?![cC][ \t])\w[\w-]*(?:=\S+)?))*)[ \t]+push(?=[\s;&|)'"\`<>]|$)`;
// Any git command whose subcommand is push after options GIT_PUSH doesn't know (--attr-source HEAD…).
const LOOSE_PUSH = /(?:^|[^\w-])[gG][iI][tT]((?:[ \t]+-\S+(?:[ \t]+[^\s;&|-]\S*)?)*)[ \t]+push(?![\w-])/g;
// A cd or pushd target, and a -C value, as a shell word: quoted parts, escapes and plain characters.
const DIR_WORD = String.raw`(?!-)(?:"[^"\n]*"|'[^'\n]*'|\\.|[^\s;&|'"\\<>()])+`;
const CD = new RegExp(String.raw`(?:^|[;&|\n({\`])[ \t]*(?:(?:then|do|else|elif|time|!)[ \t]+)*(?:builtin[ \t]+)?(?:cd|pushd)(?:[ \t]+-[LPe@]+)*(?:[ \t]+--)?[ \t]+(${DIR_WORD})`, "g");
const GIT_C = new RegExp(String.raw`(?:^|[ \t])-C[ \t]+(${DIR_WORD})`, "g");
const GIT_DIR_OPT = new RegExp(String.raw`--git-dir(?:=|[ \t]+)(${DIR_WORD})`);
const GIT_DIR_ENV = new RegExp(String.raw`(?:^|[\s;&|(])GIT_DIR=(${DIR_WORD})`, "g");

// The end of a path segment, and what can come before a dotted name, for rules that match a
// directory or file name anywhere in a command (braces, globs and commas included).
const END = String.raw`(?=[\/\s"';&|)<>\`,}*?\[]|$)`;
const LEAD = String.raw`(?:^|[\s"'=:@<>(\/{,])`;
const HOME_DIR = String.raw`(?:~|\$\{?HOME\}?|\/Users\/[^\/\s"']+|\/home\/[^\/\s"']+|\/root)["']?\/+`;
const any = (...parts) => new RegExp(parts.join("|"));

// Shell words for the search rule: quoted parts, escapes and plain characters; a redirection; and a
// home root as the shell expands it (bare ~, "$HOME", a /Users/<name> path).
const ARG = String.raw`(?:'[^'\n]*'|"[^"\n]*"|\\.|[^\s;&|'"\\<>()])+`;
const REDIR = String.raw`\d*[<>]{1,2}&?[^\s;&|'"<>()]*`;
const HOME_ROOT = String.raw`(?:~|"?\$\{?HOME\}?"?|["']?(?:\/Users\/[^\/\s"';&|]+|\/home\/[^\/\s"';&|]+|\/root))(?:\/+(?:\.config|\.claude|Library(?:\/+(?:Preferences|Application(?:\\ | )Support(?:\/+[^\/\s"';&|]+)?))?))?(?:\/(?:\.|[*?]|\[[^\]\s\/]*\])*)*["']?`;

// Shell commands that would print or load env files or secret variables. A third element "exec"
// tests the rule against execView(cmd) instead of the raw command.
const BASH_RULES = [
  [/(^|[\s;&|(])(cat|less|more|head|tail|bat|nl|strings|grep|rg|awk|sed|cut|xxd|od|base64|source|\.)\s(?:[^;&|]*?[\s/"'=])?\.env(\.[\w.-]+)?(?=["'\s;&|)]|$)/, "reads a .env file"],
  // Any command that names an .aws or .ssh directory, whatever the command. Commands that only
  // mention the path (greps, commit messages) are blocked too; reword them instead (CLAUDE.md, Hooks).
  [new RegExp(String.raw`${LEAD}\.(?:aws|ssh)${END}`), "touches AWS or SSH credential files"],
  [/\$\{?AWS_(?:SHARED_CREDENTIALS|CONFIG)_FILE\b/, "reads AWS credential files"],
  // Other local credential stores, named anywhere in the command like .aws and .ssh above: netrc, git
  // credentials, PyPI, kubeconfig, Claude Code's own config (it can hold MCP tokens) and its backups,
  // the Claude Desktop and Cursor MCP configs, the gh, Stripe and wrangler logins (also through a glob or
  // brace under ~/.config), Docker, the user .npmrc, the env vars that relocate them, and npm's auth keys.
  [
    any(
      String.raw`${LEAD}\.(?:netrc|git-credentials|pypirc|kube)${END}`,
      String.raw`\.claude\.json(?![\w-])|\.credentials\.json\b|\.claude\/backups${END}`,
      String.raw`claude_desktop_config\.json\b|\.cursor\/mcp\.json\b`,
      String.raw`\.config\/(?:gh|stripe|\.wrangler|git\/credentials)${END}|\bgh\/hosts\.yml\b|\bstripe\/config\.toml\b`,
      String.raw`${HOME_DIR}\.config\/+[^\s\/;&|]*[*?\[{]`,
      String.raw`Preferences\/\.wrangler${END}|\.wrangler\/config\b|\.docker\/config\.json\b`,
      String.raw`${HOME_DIR}\.(?:npmrc|wrangler|docker)${END}`,
      String.raw`\$\{?(?:KUBECONFIG|GH_CONFIG_DIR|DOCKER_CONFIG|CLAUDE_CONFIG_DIR)\b|\$\{?XDG_CONFIG_HOME\}?\/(?:gh|stripe|\.wrangler)${END}`,
      String.raw`:_auth(?:Token)?\b|\bnpm[ \t]+config\b[^;&|\n]{0,1000}[\s:]_auth`,
    ),
    "touches a local credential store",
  ],
  // A grep, rg, ag or ack that searches the home directory, ~/.config, ~/.claude or ~/Library (with its
  // Preferences and Application Support), or a glob straight under one, anywhere after the search
  // pattern, reads every store at once. Arguments are read as shell words, so a quoted alternation in
  // the pattern doesn't end the command, and a quoted ~ or '$HOME' (which the shell leaves alone) isn't
  // the home directory.
  [new RegExp(String.raw`(?:^|[\s;&|(])(?:e?grep|rg|ag|ack)(?:(?:[ \t]+(?:-${ARG}|${REDIR})){0,40}[ \t]+(?!-)${ARG}|(?:[ \t]+(?:-${ARG}|${REDIR})){0,40}?[ \t]+--(?:regexp|file)=${ARG})(?:[ \t]+(?:${ARG}|${REDIR})){0,40}?[ \t]+${HOME_ROOT}(?=[\s;&|)<>]|$)`), "searches a directory that holds credential stores", "exec"],
  // Commands that print a stored credential: gh's token and git helper, git's credential helpers, the
  // macOS keychain, Docker's credential helpers, npm tokens, wrangler's token, a raw kubeconfig, and an
  // MCP server's config with its env and headers.
  [
    any(
      String.raw`\bgh\s+auth\s+(?:token\b|git-credential\b|status\b[^;&|\n]{0,1000}\s(?:--show-token|-[a-zA-Z]*t[a-zA-Z]*)\b)`,
      String.raw`\bgit(?:\s+(?:-[cC]\s+[^\s-]\S*|-[\w-]+(?:=\S+)?))*\s+credential(?:-[\w-]+)?\s+(?:fill|get)\b|\bgit-credential-[\w-]+["']?\s+get\b`,
      String.raw`\bsecurity(?:\s+(?:-[a-zA-Z]+|\d*[<>]\S*))*\s+(?:find-(?:generic|internet)-password|dump-keychain|export\b[^;&|\n]{0,1000}\s-t\s+(?:identities|privKeys|allKeys))\b`,
      String.raw`\bdocker-credential-[\w-]+|\bnpm\s+token\b|\bwrangler\s+auth\s+token\b|\bclaude\s+mcp\s+get\b`,
      String.raw`\bkubectl\b[^;&|\n]{0,1000}\bconfig\s+view\b[^;&|\n]{0,1000}--(?:raw|flatten)\b`,
    ),
    "prints a stored credential",
  ],
  // Stripe's terms aren't green, so no agent runs its CLI (D13, V24); its login can reach a live account (rule 3).
  [command("stripe"), "runs the Stripe CLI, which Palin doesn't use until Stripe's terms are green (D13, V24)", "exec"],
  [/\b(?:docker|podman|nerdctl)\b[^;&|\n]{0,1000}\bstripe\/stripe-cli(?=[\s:@"']|$)|\bstripe-cli\/cmd\/stripe\b/, "runs the Stripe CLI image, which Palin doesn't use until Stripe's terms are green (D13, V24)"],
  [/(^|[\s;&|(<])(cat|less|more|head|tail|bat|nl|strings|grep|rg|awk|sed|cut|xxd|od|base64|cp|scp|openssl)\s[^;&|]*\.(pem|key|p12)(?=["'\s;&|)]|$)/, "reads a private key file"],
  // AWS CLI calls that print credentials or secrets, with or without global flags before the service.
  [/\baws(?:\s+[^\s;&|]+){0,6}?\s+(?:configure\s+(?:get|export-credentials)|sts\s+(?:get-session-token|get-federation-token|assume-ro(?:le|ot)[\w-]*)|sso\s+get-role-credentials|iam\s+(?:create-access-key|(?:create|reset)-service-specific-credential)|ecr(?:-public)?\s+get-login-password|eks\s+get-token|codeartifact\s+get-authorization-token|rds\s+generate-db-auth-token|secretsmanager\s+get-secret-value|ssm\s+get-parameters?(?:-by-path)?\s[^;&|\n]*--with-decryption|ec2\s+get-password-data)\b/, "prints AWS credentials or secrets"],
  // Embargoed results stay local until the vendor's reply window closes (D22). The push rules read the
  // "code" view (the exec view without comments), after git's own options, so a continued push or
  // `git -C dir push` still counts and a commit body that mentions pushing doesn't. A refspec with a
  // wildcard (refs/heads/*) can push every branch; a +refspec or a bundled -f forces.
  [new RegExp(String.raw`${GIT_PUSH}[^;&|\n]{0,2000}(?:\bembargo\/|\s--all\b|\s--mirror\b|\*)`), "pushes an embargoed branch or every branch (D22)", "code"],
  [/(^|[\s;&|(])(printenv)(\s|$)/, "prints environment variables"],
  [/(^|[\s;&|(])env\s*($|[;&|>])/, "prints environment variables", "exec"],
  // export, set, declare or typeset with nothing to set, and env with no command, print the environment.
  [new RegExp(String.raw`${CMD_START}${CMD_PREFIX}(?:export(?:[ \t]+-p)?|set|(?:declare|typeset)(?:[ \t]+[-+][a-zA-Z]+)*|${WRAPPER_PATH}env(?:[ \t]+(?:-[0iv]+|-[0iv]*u[ \t]*[^\s;&|<>()-][^\s;&|<>()]*|--(?:null|debug|ignore-environment|unset=[^\s;&|<>()]+)))*)(?:(?:[ \t]+\d*)?[<>]{1,2}(?![<>])[|&]?[ \t]*[^\s;&|<>()]*)*[ \t]*(?=$|[;&|)\n\`])`), "prints environment variables", "exec"],
  [/(echo|printf)[^;&|]*\$\{?[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)[A-Z0-9_]*\}?/, "prints a secret variable"],
  [/\b(?:declare|typeset)[ \t]+-[a-zA-Z]*p[a-zA-Z]*\b[^;&|\n]{0,1000}\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)/, "prints a secret variable"],
  [new RegExp(String.raw`${GIT_PUSH}[^;&|\n]{0,2000}(?:\s--force(?:-with-lease)?\b|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s["']?\+[^\s'"])`), "force-pushes", "code"],
  [/\bPALIN_ALLOW_PRODUCTION\b/, "tries to enable production access, which Palin never allows"],
];

// Drops unquoted comments. With carry, the quote state runs on from line to line (a "#" inside an open
// quote is text); without it, each line is scanned on its own. A heredoc body that isn't skipped is
// literal text with its own stray quotes, so the push checks read both views.
function stripComments(view, carry) {
  let q = "";
  return view
    .split("\n")
    .map((line) => {
      const st = scanLine(line, carry ? q : "");
      q = st.q;
      return st.comment >= 0 ? line.slice(0, st.comment) : line;
    })
    .join("\n");
}

// Whether a comment-free view pushes; where it moves first (cd and pushd targets, each git -C chain,
// --git-dir and GIT_DIR values, in order, at most 16); and whether a move can't be followed (more
// moves, or git options GIT_PUSH doesn't know, matched by position).
function pushInfo(code) {
  const moves = [];
  let pushes = false;
  let unresolved = false;
  const addGitMoves = (at, options) => {
    const chain = [...options.matchAll(GIT_C)].map((c) => c[1]);
    if (chain.length) moves.push({ at, kind: "C", dirs: chain });
    const gitDir = GIT_DIR_OPT.exec(options);
    if (gitDir) moves.push({ at, kind: "gitdir", dirs: [gitDir[1]] });
  };
  const strictEnds = new Set();
  for (const m of code.matchAll(new RegExp(GIT_PUSH, "g"))) {
    pushes = true;
    strictEnds.add(m.index + m[0].length);
    addGitMoves(m.index, m[1]);
    if (moves.length > 16) break;
  }
  for (const m of code.matchAll(LOOSE_PUSH)) {
    if (strictEnds.has(m.index + m[0].length)) continue;
    pushes = unresolved = true;
    addGitMoves(m.index, m[1]);
    if (moves.length > 16) break;
  }
  if (pushes) {
    for (const m of code.matchAll(CD)) {
      moves.push({ at: m.index, kind: "cd", dirs: [m[1]] });
      if (moves.length > 32) break;
    }
    for (const m of code.matchAll(GIT_DIR_ENV)) {
      moves.push({ at: m.index, kind: "gitdir", dirs: [m[1]] });
      if (moves.length > 32) break;
    }
  }
  moves.sort((a, b) => a.at - b.at);
  if (moves.length > 16) unresolved = true;
  return { pushes, unresolved, moves: moves.slice(0, 16) };
}

// The first reason to block a Bash command, or null (secrets are checked first), and the push facts
// from each comment-free view.
function checkBash(cmd) {
  const exec = execView(cmd);
  const carried = stripComments(exec, true);
  const fresh = stripComments(exec, false);
  const codes = carried === fresh ? [carried] : [carried, fresh];
  const infos = codes.map(pushInfo);
  const result = (reason) => ({
    reason,
    pushes: infos.some((i) => i.pushes),
    unresolved: infos.some((i) => i.unresolved),
    moveSets: infos.map((i) => i.moves),
  });
  for (const [re, what] of SECRET_PATTERNS) if (re.test(cmd)) return result(`this command contains ${what}`);
  for (const [re, what, view] of BASH_RULES) {
    const hit = view === "code" ? codes.some((c) => re.test(c)) : re.test(view === "exec" ? exec : cmd);
    if (hit) return result(`this command ${what}`);
  }
  return result(null);
}

// Claude Code lets a command through when a hook times out, so the checks get a time limit well under
// the hook's own, and running out of time blocks. Tests can only lower the limit.
const LIMIT_MS = Math.min(4000, Number(process.env.PALIN_GUARD_LIMIT_MS) || 4000);

// Credential files an edit tool must never write, wherever they are, whatever the settings deny
// (settings don't reach every session). APFS is case-insensitive, so the match is too.
const CREDENTIAL_FILE = /(?:^|\/)(?:\.aws|\.ssh|\.kube|\.config\/(?:gh|stripe|\.wrangler)|Library\/Preferences\/\.wrangler|\.wrangler\/config|\.claude\/backups)(?:\/|$)|(?:^|\/)(?:\.netrc|\.git-credentials|\.pypirc|\.claude\.json(?:\.[\w.-]+)?|\.claude\/\.credentials\.json|\.docker\/config\.json|\.config\/git\/credentials|claude_desktop_config\.json|\.cursor\/mcp\.json)$/i;

// Repo lookups on disk, the way git finds them: no git process and no git config are involved.
const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const looksLikeGitDir = (p) => isFile(join(p, "HEAD")) && (isDir(join(p, "objects")) || isFile(join(p, "commondir")));
// The git directory of the repo that holds dir: a valid .git directory, a .git file that points at one
// (a linked worktree), or dir itself when it is a git directory (a bare repo). The walk follows the
// physical path, as git does.
function gitDirOf(dir) {
  let start = dir;
  try {
    start = realpathSync(dir);
  } catch {}
  for (let d = start; ; d = dirname(d)) {
    const dotGit = join(d, ".git");
    if (isDir(dotGit) && looksLikeGitDir(dotGit)) return dotGit;
    if (isFile(dotGit)) {
      try {
        const m = /^gitdir:[ \t]*(.+?)[ \t]*$/m.exec(readFileSync(dotGit, "utf8"));
        if (m) return resolve(d, m[1]);
      } catch {}
    }
    if (looksLikeGitDir(d)) return d;
    if (dirname(d) === d) return null;
  }
}
// "embargo", "unknown" (a reftable repo keeps its branch in tables, not in HEAD), or "other".
function headState(gitDir) {
  const head = join(gitDir, "HEAD");
  if (!isFile(head)) return "other";
  let text = "";
  try {
    text = readFileSync(head, "utf8");
  } catch {
    return "other";
  }
  if (/^ref:[ \t]*refs\/heads\/embargo\//.test(text)) return "embargo";
  if (/^ref:[ \t]*refs\/heads\/\.invalid\b/.test(text)) return "unknown";
  return "other";
}
// Whether the main checkout or any linked worktree of gitDir's repo is (or may be) on an embargo branch.
function anyCheckoutMayBeEmbargo(gitDir) {
  let common = gitDir;
  const commondir = join(gitDir, "commondir");
  if (isFile(commondir)) {
    try {
      common = resolve(gitDir, readFileSync(commondir, "utf8").trim());
    } catch {}
  }
  if (headState(common) !== "other") return true;
  let names = [];
  try {
    names = readdirSync(join(common, "worktrees"));
  } catch {}
  return names.some((n) => headState(join(common, "worktrees", n)) !== "other");
}

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
if (!input || typeof input !== "object") process.exit(0);

const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

if (tool === "Bash") {
  const cmd = String(ti.command ?? "");
  let result;
  try {
    result = vm.runInNewContext("checkBash(cmd)", { checkBash, cmd }, { timeout: LIMIT_MS });
  } catch {
    block("the guard couldn't check this command in time; split it up, or write long text to a file with the Write tool");
  }
  if (result.reason) block(result.reason);
  // A bare `git push` pushes the checked-out branch, so refuse any push while an embargo branch is
  // checked out (D22): in the session's directory, or wherever the command points it with cd, pushd,
  // git -C, --git-dir or GIT_DIR. When the command moves in a way the guard can't follow, refuse the
  // push if any checkout of those repos is on an embargo branch. HEAD is read from disk.
  if (result.pushes) {
    try {
      if (input.cwd != null && typeof input.cwd !== "string") throw new Error("cwd");
      const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const dirs = [start];
      const gitDirsNamed = [];
      let unresolved = result.unresolved;
      for (const moves of result.moveSets) {
        let here = start;
        for (const { kind, dirs: words } of moves) {
          let target = here;
          for (const word of words) {
            if (word.includes("\0")) throw new Error("NUL");
            const d = word
              .replace(/'([^']*)'|"([^"]*)"|\\(.)/g, (_, a, b, c) => a ?? b ?? c)
              .replace(/^(?:~|\$\{?HOME\}?)(?=\/|$)/, homedir());
            if (/[$`*?~\0[{]/.test(d)) {
              target = null;
              break;
            }
            target = resolve(target, d);
          }
          if (!target) unresolved = true;
          else if (kind === "gitdir") gitDirsNamed.push(target);
          else {
            if (kind === "cd") here = target;
            dirs.push(target);
          }
        }
      }
      const gitDirs = [...new Set([...dirs.map(gitDirOf), ...gitDirsNamed].filter(Boolean))];
      const states = gitDirs.map(headState);
      if (states.includes("embargo")) block("this command pushes while an embargo/ branch is checked out (D22)");
      if (states.includes("unknown")) {
        block("this command pushes from a repo whose branch the guard can't read (reftable); push from your own terminal (D22)");
      }
      const moved = unresolved || result.moveSets.some((m) => m.length);
      if (moved && gitDirs.some(anyCheckoutMayBeEmbargo)) {
        block("this command moves to another directory and pushes while a checkout of this repo is on an embargo/ branch (D22); run the push on its own, from the directory it pushes");
      }
    } catch {
      block("the guard couldn't tell where this push runs");
    }
  }
  process.exit(0);
}

if (tool === "Edit" || tool === "Write" || tool === "MultiEdit" || tool === "NotebookEdit") {
  const home = homedir().replace(/\\/g, "/");
  const file = posix.normalize(
    String(ti.file_path ?? ti.notebook_path ?? "").replace(/\\/g, "/").replace(/^~(?=\/|$)/, home),
  );
  const name = basename(file);
  if (/^\.env(\..+)?$/i.test(name)) block(`it writes to ${name}; secrets files are filled in by the maintainer only`);
  if (CREDENTIAL_FILE.test(file) || file.toLowerCase() === `${home}/.npmrc`.toLowerCase()) {
    block(`it writes to ${file}, a local credential store`);
  }

  // Tests may hold fake secrets, but only on lines that say FAKE (see docs/HARNESS.md).
  const isTestFile = /(^|\/)(test|tests|__tests__|fixtures)\//.test(file) || /\.test\.[cm]?[jt]s$/.test(file);

  const edits = Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [];
  const texts = [ti.content, ti.new_string, ti.new_source, ...edits].filter((t) => typeof t === "string");
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
