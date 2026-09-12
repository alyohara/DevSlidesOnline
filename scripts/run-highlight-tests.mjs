#!/usr/bin/env node
/**
 * Bundles the highlight-token regression suite (TS, imports from src/) with
 * the repo's esbuild, then runs it with node's built-in test runner.
 * No additional dev-dependencies required.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "./lib/root.mjs";

const out = join(repoRoot, ".cache-tests", "highlight-tokens.test.mjs");

execFileSync(
  join(repoRoot, "node_modules", ".bin", "esbuild"),
  [
    join(repoRoot, "tests", "highlight-tokens.test.mts"),
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${out}`,
    "--log-level=warning",
  ],
  { stdio: "inherit" },
);

execFileSync(process.execPath, ["--test", out], { stdio: "inherit" });
