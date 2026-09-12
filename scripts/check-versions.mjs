// The release version must stay in sync between package.json (drives release
// tags/names) and the server's compiled-in version. Fail the build if they
// drift so a mismatch is caught before release.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { repoRoot } from "./lib/root.mjs";

const pkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const pkgVersion = pkg.version;

// The server exposes APP_VERSION as an exported const the frontend reads at
// runtime (server/src/version.ts) — keep the two authoritative copies in lock
// step.
const versionModule = fs.readFileSync(
  path.join(repoRoot, "server", "src", "version.ts"),
  "utf8",
);
const versionMatch = versionModule.match(/export const APP_VERSION = "(.*)";/);
if (!versionMatch || versionMatch[1] !== pkgVersion) {
  console.error(
    `Version mismatch: package.json=${pkgVersion} server/src/version.ts=${versionMatch?.[1] ?? "missing"}`,
  );
  console.error("Bump both sources together.");
  process.exit(1);
}

// On a tag push, CI checks out the tagged commit detached, so the exact git
// tag is the version the release will be cut under — it must agree too.
// Branch and PR pushes are not on a tagged commit; `git describe` fails there.
let tag = "";
try {
  tag = execFileSync("git", ["describe", "--tags", "--exact-match"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  // Not on a tagged commit — nothing to compare.
}
if (tag.startsWith("v") && tag.slice(1) !== pkgVersion) {
  console.error(`Version mismatch: git tag=${tag.slice(1)} package.json=${pkgVersion}`);
  process.exit(1);
}

console.log(`Versions in sync: ${pkgVersion}`);