import { Database } from "bun:sqlite";

// Base schema, ported from src-tauri/src/db/schema.rs. The DeVSlidesOnline
// additions live on top: a `users` table, a `sessions` table for cookie auth,
// and `projects.user_id` for per-user data isolation.
const BASE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    theme TEXT NOT NULL DEFAULT 'dark-plus',
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    group_id TEXT DEFAULT NULL,
    group_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS slides (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    code TEXT NOT NULL,
    transition_duration INTEGER NOT NULL DEFAULT 750,
    stagger INTEGER NOT NULL DEFAULT 5,
    duration INTEGER NOT NULL DEFAULT 3000,
    name TEXT NOT NULL DEFAULT '',
    highlights TEXT NOT NULL DEFAULT '[]',
    thumbnail_html TEXT NOT NULL DEFAULT '',
    section_id TEXT DEFAULT NULL,
    images TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slides_project ON slides(project_id, order_index);
`;

// Incremental, additive migrations — ported from src-tauri/src/db/migrations.rs.
// Steps are guarded to be no-ops on fresh databases (all final columns exist in
// BASE_SCHEMA) so a legacy DevSlides DB can be dropped in and upgraded safely.
export const TARGET_VERSION = 10;

export function openDatabase(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(BASE_SCHEMA_SQL);
  runMigrations(db);
  return db;
}

function currentVersion(db: Database): number {
  const row = db.query("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (row) return row.version;
  db.query("INSERT INTO schema_version (version) VALUES (0)").run();
  return 0;
}

function setVersion(db: Database, version: number): void {
  db.query("UPDATE schema_version SET version = ?").run(version);
}

function columnExists(db: Database, table: string, column: string): boolean {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function runMigrations(db: Database): void {
  let version = currentVersion(db);

  // v1: hoist language into projects.settings JSON.
  if (version < 1) {
    const projects = db.query("SELECT id, settings FROM projects").all() as Array<{
      id: string;
      settings: string;
    }>;
    for (const p of projects) {
      let settings: Record<string, unknown>;
      try {
        settings = JSON.parse(p.settings);
      } catch {
        settings = {};
      }
      const currentLang = settings.language;
      const needsLang = typeof currentLang !== "string" || currentLang === "";
      if (needsLang) {
        const langRow = db
          .query(
            "SELECT language FROM slides WHERE project_id = ? ORDER BY order_index ASC LIMIT 1",
          )
          .get(p.id) as { language: string } | undefined;
        let lang = langRow?.language ?? "typescript";
        if (lang.trim() === "" || lang === "dynamic") lang = "typescript";
        settings.language = lang.trim();
        db.query("UPDATE projects SET settings = ? WHERE id = ?").run(
          JSON.stringify(settings),
          p.id,
        );
        db.query(
          "UPDATE slides SET language = ? WHERE project_id = ? AND (language = 'dynamic' OR language = '')",
        ).run(lang, p.id);
      }
    }
    version = 1;
    setVersion(db, version);
  }

  // v2: slide.name + default codeAlign in settings
  if (version < 2) {
    if (!columnExists(db, "slides", "name")) {
      db.exec("ALTER TABLE slides ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    }
    const slides = db
      .query("SELECT id, name, order_index FROM slides ORDER BY project_id, order_index")
      .all() as Array<{ id: string; name: string; order_index: number }>;
    for (const slide of slides) {
      if ((slide.name ?? "").trim() === "") {
        db.query("UPDATE slides SET name = ? WHERE id = ?").run(
          `Slide ${slide.order_index + 1}`,
          slide.id,
        );
      }
    }
    const projects = db.query("SELECT id, settings FROM projects").all() as Array<{
      id: string;
      settings: string;
    }>;
    for (const p of projects) {
      let settings: Record<string, unknown>;
      try {
        settings = JSON.parse(p.settings);
      } catch {
        settings = {};
      }
      if (settings.codeAlign === undefined) {
        settings.codeAlign = "left";
        db.query("UPDATE projects SET settings = ? WHERE id = ?").run(
          JSON.stringify(settings),
          p.id,
        );
      }
    }
    version = 2;
    setVersion(db, version);
  }

  // v3: highlights JSON column on slides
  if (version < 3) {
    if (!columnExists(db, "slides", "highlights")) {
      db.exec("ALTER TABLE slides ADD COLUMN highlights TEXT NOT NULL DEFAULT '[]'");
    }
    version = 3;
    setVersion(db, version);
  }

  // v4: FTS5 index for ranked, project-scoped slide search.
  if (version < 4) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS slides_fts USING fts5(
        name,
        code,
        content=slides,
        content_rowid=rowid
      );
      CREATE TRIGGER IF NOT EXISTS slides_fts_ai AFTER INSERT ON slides BEGIN
        INSERT INTO slides_fts(rowid, name, code)
        VALUES (new.rowid, new.name, new.code);
      END;
      CREATE TRIGGER IF NOT EXISTS slides_fts_ad AFTER DELETE ON slides BEGIN
        INSERT INTO slides_fts(slides_fts, rowid, name, code)
        VALUES ('delete', old.rowid, old.name, old.code);
      END;
      CREATE TRIGGER IF NOT EXISTS slides_fts_au AFTER UPDATE OF name, code ON slides BEGIN
        INSERT INTO slides_fts(slides_fts, rowid, name, code)
        VALUES ('delete', old.rowid, old.name, old.code);
        INSERT INTO slides_fts(rowid, name, code)
        VALUES (new.rowid, new.name, new.code);
      END;
      INSERT INTO slides_fts(slides_fts) VALUES ('rebuild');
    `);
    version = 4;
    setVersion(db, version);
  }

  // v5: write-behind Shiki thumbnail cache.
  if (version < 5) {
    if (!columnExists(db, "slides", "thumbnail_html")) {
      db.exec("ALTER TABLE slides ADD COLUMN thumbnail_html TEXT NOT NULL DEFAULT ''");
    }
    version = 5;
    setVersion(db, version);
  }

  // v6: drop the legacy per-slide language mirror.
  if (version < 6) {
    if (columnExists(db, "slides", "language")) {
      db.exec("ALTER TABLE slides DROP COLUMN language");
    }
    version = 6;
    setVersion(db, version);
  }

  // v7: group_id / group_order on projects (dashboard stacks).
  if (version < 7) {
    if (!columnExists(db, "projects", "group_id")) {
      db.exec("ALTER TABLE projects ADD COLUMN group_id TEXT DEFAULT NULL");
    }
    if (!columnExists(db, "projects", "group_order")) {
      db.exec("ALTER TABLE projects ADD COLUMN group_order INTEGER NOT NULL DEFAULT 0");
    }
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id, group_order)",
    );
    version = 7;
    setVersion(db, version);
  }

  // v8: section_id on slides (slide strip stacks / sections).
  if (version < 8) {
    if (!columnExists(db, "slides", "section_id")) {
      db.exec("ALTER TABLE slides ADD COLUMN section_id TEXT DEFAULT NULL");
    }
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_slides_section ON slides(project_id, section_id, order_index)",
    );
    version = 8;
    setVersion(db, version);
  }

  // v9: images JSON column on slides.
  if (version < 9) {
    if (!columnExists(db, "slides", "images")) {
      db.exec("ALTER TABLE slides ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
    }
    version = 9;
    setVersion(db, version);
  }

  // v10: per-user ownership (multi-user). No-op on fresh databases where
  // BASE_SCHEMA already carries the column; upgrades a legacy single-user DB.
  if (version < 10) {
    if (!columnExists(db, "projects", "user_id")) {
      db.exec("ALTER TABLE projects ADD COLUMN user_id TEXT DEFAULT NULL");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)");
    version = 10;
    setVersion(db, version);
  }

  if (version < TARGET_VERSION) {
    setVersion(db, TARGET_VERSION);
  }
}

export type { Database } from "bun:sqlite";