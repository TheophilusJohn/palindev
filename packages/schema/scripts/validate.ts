// `pnpm validate` in this repository (the root package.json runs it with tsx, so no build is needed).
// pnpm runs root scripts from the repository root and sets INIT_CWD to the directory the user ran
// pnpm from, so relative paths resolve where they were typed while the default stays the repo's data/.
// Only this repo-only entry point reads INIT_CWD; the published palin-validate (src/cli.ts) doesn't.

import { join } from "node:path";
import { main } from "../src/main.js";

process.exitCode = main(process.argv.slice(2), {
  cwd: process.env.INIT_CWD ?? process.cwd(),
  defaultRoot: join(process.cwd(), "data"),
  probeMailDomain: process.env.PALIN_PROBE_MAIL_DOMAIN,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
