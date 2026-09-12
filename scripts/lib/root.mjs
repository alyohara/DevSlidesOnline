// Single source of truth for the repository root. Scripts under scripts/ run
// from different working directories (CI invokes them via `bun run` from the
// repo root; tests may invoke siblings directly), so the only stable reference
// is this module's own location on disk.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
