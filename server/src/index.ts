/**
 * DevSlidesOnline server entrypoint.
 *
 * - Opens (and migrates) the SQLite database.
 * - Serves the REST API under /api.
 * - In production serves the built frontend from ../dist (relative to the
 *   server/ directory), so a single Bun process runs the whole app.
 *
 * During development just run `bun run dev:server`; `vite` proxies /api to
 * this port (see ../vite.config.ts), so no static serving is needed.
 */
import { serveStatic } from "hono/bun";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "./db";
import { createApp } from "./routes";

const PORT = Number(process.env.PORT ?? 1421);
const HOST = process.env.HOST ?? "0.0.0.0";

// ./data relative to the server working directory (default when run via
// `bun run dev:server` / `bun run server/src/index.ts`). Overridable for
// containers, e.g. DATABASE_PATH=/app/data/devslides.db.
const defaultDbDir = resolve("data");
if (!existsSync(defaultDbDir)) mkdirSync(defaultDbDir, { recursive: true });
const dbPath = process.env.DATABASE_PATH ?? resolve(defaultDbDir, "devslides.db");

const db = openDatabase(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const app = createApp(db);

// Health check for container orchestrators / uptime probes.
app.get("/healthz", (c) => c.json({ ok: true }));

const distDir = resolve("dist");
if (existsSync(distDir)) {
  // Single-process deployment: serve the built SPA with a hash-router
  // friendly fallback, API paths stay untouched.
  app.get(
    "*",
    serveStatic({
      root: distDir,
      rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p),
    }),
  );
  app.get(
    "*",
    serveStatic({ path: resolve(distDir, "index.html") }),
  );
}

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
  idleTimeout: 60,
};