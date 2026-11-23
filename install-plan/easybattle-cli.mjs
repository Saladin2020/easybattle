#!/usr/bin/env node
/**
 * Studio CLI wrapper around Easy Battle (list / sim / check / render / encounter / export without MCP).
 *
 * Usage:
 *   node /workspace/indie-studio/tools/easybattle-cli.mjs <command> [options]
 *
 * Install:  EASYBATTLE_HOME, else this folder's easybattle/
 * The starter battles live in the install (init copies it). Game battle files and exports may be written under
 * /workspace/indie-studio/projects/<Name> (pre-allowed).
 * export --out (single preset) writes into that folder without deleting stale files; use a dedicated folder.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOME = path.resolve(process.env.EASYBATTLE_HOME?.trim() || path.join(here, "easybattle"));
const STUDIO_PROJECTS = path.resolve(here, "..", "projects");
const cli = path.join(HOME, "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(`Easy Battle CLI not found at ${cli}. Set EASYBATTLE_HOME and run npm ci && npm run build there.`);
  process.exit(1);
}

const env = {
  ...process.env,
  EASYBATTLE_HOME: HOME,
  EASYBATTLE_WORKSPACE: process.env.EASYBATTLE_WORKSPACE?.trim() || HOME,
};
const allowed = new Set(
  (env.EASYBATTLE_ALLOWED_DIRS ?? "")
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean),
);
allowed.add(STUDIO_PROJECTS);
env.EASYBATTLE_ALLOWED_DIRS = [...allowed].join(path.delimiter);

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: HOME,
  stdio: "inherit",
  env,
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
