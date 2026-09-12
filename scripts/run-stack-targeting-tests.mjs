#!/usr/bin/env node
/**
 * Bundles the stack-targeting unit tests (pure TS, imports from src/) with
 * the repo's esbuild, then runs them with node's built-in test runner.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "./lib/root.mjs";

const out = join(repoRoot, ".cache-tests", "stack-targeting.test.mjs");

execFileSync(
  join(repoRoot, "node_modules", ".bin", "esbuild"),
  [
    join(repoRoot, "tests", "stack-targeting.test.mts"),
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${out}`,
    "--log-level=warning",
  ],
  { stdio: "inherit" },
);

execFileSync(process.execPath, ["--test", out], { stdio: "inherit" });
