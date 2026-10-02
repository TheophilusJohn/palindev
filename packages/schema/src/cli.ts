#!/usr/bin/env node
// palin-validate, the published command (dist/cli.js). In this repository, `pnpm validate` runs
// scripts/validate.ts instead, which resolves paths from where the user typed the command.

import { main } from "./main.js";

process.exitCode = main(process.argv.slice(2), {
  cwd: process.cwd(),
  probeMailDomain: process.env.PALIN_PROBE_MAIL_DOMAIN,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
