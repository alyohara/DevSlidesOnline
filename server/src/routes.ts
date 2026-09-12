import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Database } from "bun:sqlite";
import {
  ApiError,
  authHelper,
  findUserByUsername,
  hashPassword,
  requireAuth,
  validPassword,
  validUsername,
  verifyPassword,
} from "./auth";
import {
  batchReindex,
  fetchProject,
  fetchSlideOwned,
  fetchSlides,
  getProjectSummaries,
  insertProject,
  insertSlide,
  invalidateProjectThumbnails,
  loadSettings,
  makeSlideName,
  normalizeCopiedSlideHighlights,
  normalizeImportedHighlights,
  remapSectionId,
  saveSettings,
  touchProject,
  type NewSlide,
} from "./helpers";
import {
  DEFAULT_CODE,
  DEFAULT_SLIDE_DURATION_MS,
  DEFAULT_SLIDE_STAGGER,
  DEFAULT_SLIDE_TRANSITION_MS,
  DEFAULT_THEME,
  defaultSettings,
  isSupportedLang,
  isSupportedTheme,
  mergeSettings,
  normalizeCodeAlign,
  normalizeLanguage,
  parseSettings,
  sanitizeFilename,
  SUPPORTED_LANGUAGES,
  SUPPORTED_THEMES,
  nowMs,
  type Project,
  type ProjectSettings,
  type Slide,
  type SlideSettingsPatch,
} from "./models";
import { APP_INFO } from "./version";

type Env = {
  Variables: {
    userId: string;
    username: string;
  };
};

export function createApp(db: Database): Hono<Env> {
  const app = new Hono<Env>();
  const auth = authHelper(db);

  // --- Error contract (mirrors Rust { code, message } IPC errors) ---
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(
        { code: err.code, message: err.message },
        err.status as ContentfulStatusCode,
      );
    }
    return c.json({ code: "ERROR", message: String(err?.message ?? err) }, 500);
  });
  app.notFound((c) => c.json({ code: "NOT_FOUND", message: "Route not found" }, 404));

  // --- Auth (public) ---
  app.post("/api/auth/register", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: unknown;
      password?: unknown;
    };
    const username = validUsername(String(body.username ?? ""));
    validPassword(String(body.password ?? ""));
    if (findUserByUsername(db, username)) {
      throw ApiError.validation("That username is already taken");
    }
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(String(body.password));
    db.query(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ).run(userId, username, passwordHash, nowMs());
    auth.issueLoginCookie(c, userId);
    return c.json({ user: { id: userId, username } });
  });

  app.post("/api/auth/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: unknown;
      password?: unknown;
    };
    const username = String(body.username ?? "").trim();
    const user = findUserByUsername(db, username);
    if (!user || !(await verifyPassword(String(body.password ?? ""), user.password_hash))) {
      throw new ApiError(401, "UNAUTHORIZED", "Incorrect username or password");
    }
    auth.issueLoginCookie(c, user.id);
    return c.json({ user: { id: user.id, username: user.username } });
  });

  app.post("/api/auth/logout", (c) => {
    auth.clearLoginCookie(c);
    return c.json({ ok: true });
  });

  // --- Meta (public — used by initBackendConfig before/without login) ---
  app.get("/api/meta/default-settings", (c) => c.json(defaultSettings()));
  app.get("/api/meta/languages", (c) => c.json(SUPPORTED_LANGUAGES));
  app.get("/api/meta/themes", (c) => c.json(SUPPORTED_THEMES));
  app.get("/api/meta/app-info", (c) => c.json(APP_INFO));

  // --- Everything below requires a session ---
  app.use("/api/*", requireAuth(db));
  const userIdOf = (c: Context<Env>) => c.get("userId");
  const currentUser = (c: Context<Env>) => auth.currentUser(c);

  app.get("/api/auth/me", (c) => c.json({ user: currentUser(c) }));

  // --- Projects ---
  app.get("/api/projects", (c) => c.json(getProjectSummaries(db, userIdOf(c))));

  app.post("/api/projects", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    return c.json(
      functionCreateProject(db, userIdOf(c), { name: typeof body.name === "string" ? body.name : "" }),
    );
  });

  app.post("/api/projects/import", async (c) => {
    const userId = userIdOf(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const project = importProject(db, userId, body);
    return c.json(project);
  });

  app.get("/api/projects/:id", (c) =>
    c.json(fetchProject(db, userIdOf(c), c.req.param("id"))),
  );

  app.patch("/api/projects/:id", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const finalName = String(body.name ?? "").trim() || "Untitled Presentation";
    const res = db
      .query("UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(finalName, nowMs(), projectId, userId);
    if (res.changes === 0) throw ApiError.notFound(`Presentation not found: ${projectId}`);
    return c.json(fetchProject(db, userId, projectId));
  });

  app.post("/api/projects/:id/duplicate", (c) =>
    c.json(duplicateProject(db, userIdOf(c), c.req.param("id"))),
  );

  app.delete("/api/projects/:id", (c) => {
    const res = db
      .query("DELETE FROM projects WHERE id = ? AND user_id = ?")
      .run(c.req.param("id"), userIdOf(c));
    if (res.changes === 0) {
      throw ApiError.notFound(`Presentation not found: ${c.req.param("id")}`);
    }
    return c.json({ ok: true });
  });

  app.patch("/api/projects/:id/settings", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { settings?: Record<string, unknown> };
    const existing = loadSettings(db, userId, projectId);
    const merged = mergeSettings(existing, body.settings ?? {});
    if (!isSupportedLang(merged.language)) {
      throw ApiError.validation(`Unsupported language: ${merged.language}`);
    }
    saveSettings(db, projectId, merged, true);
    if (merged.language !== existing.language) {
      invalidateProjectThumbnails(db, projectId);
    }
    return c.json(fetchProject(db, userId, projectId));
  });

  app.patch("/api/projects/:id/theme", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { theme?: unknown };
    const theme = String(body.theme ?? "");
    if (!isSupportedTheme(theme)) throw ApiError.validation(`Unsupported theme: ${theme}`);
    const res = db
      .query("UPDATE projects SET theme = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(theme, nowMs(), projectId, userId);
    if (res.changes === 0) throw ApiError.notFound(`Presentation not found: ${projectId}`);
    invalidateProjectThumbnails(db, projectId);
    return c.json(fetchProject(db, userId, projectId));
  });

  app.get("/api/projects/:id/export.json", (c) => {
    const userId = userIdOf(c);
    const project = fetchProject(db, userId, c.req.param("id"));
    const filename = `${sanitizeFilename(project.name)}.json`;
    return c.json({
      filename,
      content: JSON.stringify(buildExportJson(project), null, 2),
    });
  });

  app.get("/api/projects/:id/search", (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    assertProjectOwned(db, userId, projectId);
    const query = (c.req.query("q") ?? "").trim();
    return c.json(searchSlides(db, projectId, query));
  });

  // --- Slides ---
  app.post("/api/projects/:id/slides", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown; name?: unknown };
    return c.json(createSlide(db, userId, projectId, {
      code: typeof body.code === "string" ? body.code : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
    }));
  });

  app.put("/api/projects/:id/slides/order", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { slideIds?: unknown };
    const slideIds = Array.isArray(body.slideIds)
      ? (body.slideIds.filter((v): v is string => typeof v === "string"))
      : [];
    assertProjectOwned(db, userId, projectId);
    if (slideIds.length > 0) {
      const actual = (
        db.query("SELECT id FROM slides WHERE project_id = ?").all(projectId) as Array<{ id: string }>
      ).map((r) => r.id);
      const requested = new Set(slideIds);
      if (requested.size !== slideIds.length || requested.size !== new Set(actual).size) {
        throw ApiError.validation(
          "Slide order must contain each slide in the presentation exactly once",
        );
      }
      for (const id of slideIds) {
        if (!actual.includes(id)) {
          throw ApiError.validation(
            "Slide order must contain each slide in the presentation exactly once",
          );
        }
      }
      batchReindex(db, projectId, slideIds);
      touchProject(db, projectId);
    }
    return c.json(fetchProject(db, userId, projectId));
  });

  app.post("/api/projects/:id/slides/restore", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      slide?: Record<string, unknown>;
      insertAt?: unknown;
    };
    return c.json(restoreSlide(db, userId, projectId, body.slide ?? {}, body.insertAt));
  });

  app.post("/api/projects/:id/slides/:slideId/duplicate", (c) =>
    c.json(duplicateSlide(db, userIdOf(c), c.req.param("id"), c.req.param("slideId"))),
  );

  app.delete("/api/projects/:id/slides/:slideId", (c) =>
    c.json(deleteSlide(db, userIdOf(c), c.req.param("id"), c.req.param("slideId"))),
  );

  app.patch("/api/slides/:id/code", async (c) => {
    const userId = userIdOf(c);
    const slideId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
    const code = String(body.code ?? "");
    const owned = fetchSlideOwned(db, userId, slideId);
    if (!owned) throw ApiError.notFound(`Slide not found: ${slideId}`);
    db.query("UPDATE slides SET code = ?, thumbnail_html = '' WHERE id = ?").run(
      code,
      slideId,
    );
    touchProject(db, owned.project_id);
    return c.json({ ok: true });
  });

  app.put("/api/slides/:id/thumbnail", async (c) => {
    const userId = userIdOf(c);
    const slideId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown; html?: unknown };
    const owned = fetchSlideOwned(db, userId, slideId);
    if (!owned) throw ApiError.notFound(`Slide not found: ${slideId}`);
    db.query("UPDATE slides SET thumbnail_html = ? WHERE id = ? AND code = ?").run(
      String(body.html ?? ""),
      slideId,
      String(body.code ?? ""),
    );
    return c.json({ ok: true });
  });

  app.patch("/api/slides/:id/settings", async (c) => {
    const userId = userIdOf(c);
    const slideId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as SlideSettingsPatch;
    return c.json(updateSlideSettings(db, userId, slideId, body));
  });

  app.put("/api/projects/:id/current-slide", async (c) => {
    const userId = userIdOf(c);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { slideId?: unknown };
    const slideId = String(body.slideId ?? "");
    const belongs = db
      .query("SELECT COUNT(*) AS n FROM slides WHERE id = ? AND project_id = ? AND (SELECT user_id FROM projects WHERE id = ?) = ?")
      .get(slideId, projectId, projectId, userId) as { n: number };
    if (!belongs || belongs.n === 0) {
      throw ApiError.validation(
        "Current slide must belong to the selected presentation",
      );
    }
    const settings = loadSettings(db, userId, projectId);
    settings.currentSlideId = slideId;
    saveSettings(db, projectId, settings, false);
    return c.json({ ok: true });
  });

  // --- Stacks (project groups / slide sections) ---
  app.post("/api/stacks/projects", async (c) => {
    const userId = userIdOf(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      sourceIds?: unknown;
      targetId?: unknown;
    };
    const sourceIds = toStringArray(body.sourceIds);
    const targetId = String(body.targetId ?? "");
    if (sourceIds.includes(targetId)) {
      throw ApiError.validation("Target presentation cannot be in sources");
    }
    if (sourceIds.length === 0) return c.json(getProjectSummaries(db, userId));
    assertProjectsOwned(db, userId, [targetId, ...sourceIds]);
    stackProjects(db, targetId, sourceIds);
    return c.json(getProjectSummaries(db, userId));
  });

  app.delete("/api/stacks/projects", async (c) => {
    const userId = userIdOf(c);
    const body = (await c.req.json().catch(() => ({}))) as { projectIds?: unknown };
    const projectIds = toStringArray(body.projectIds);
    if (projectIds.length === 0) return c.json(getProjectSummaries(db, userId));
    assertProjectsOwned(db, userId, projectIds);
    unstackProjects(db, projectIds);
    return c.json(getProjectSummaries(db, userId));
  });

  app.post("/api/stacks/slides", async (c) => {
    const userId = userIdOf(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: unknown;
      sourceIds?: unknown;
      targetId?: unknown;
    };
    const projectId = String(body.projectId ?? "");
    const sourceIds = toStringArray(body.sourceIds);
    const targetId = String(body.targetId ?? "");
    assertProjectOwned(db, userId, projectId);
    if (sourceIds.includes(targetId)) {
      throw ApiError.validation("Target slide cannot be in sources");
    }
    if (sourceIds.length === 0) {
      const settings = loadSettings(db, userId, projectId);
      return c.json(fetchSlides(db, projectId, settings.language));
    }
    stackSlides(db, projectId, sourceIds, targetId);
    const settings = loadSettings(db, userId, projectId);
    return c.json(fetchSlides(db, projectId, settings.language));
  });

  app.delete("/api/stacks/slides", async (c) => {
    const userId = userIdOf(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: unknown;
      slideIds?: unknown;
    };
    const projectId = String(body.projectId ?? "");
    const slideIds = toStringArray(body.slideIds);
    assertProjectOwned(db, userId, projectId);
    if (slideIds.length === 0) {
      const settings = loadSettings(db, userId, projectId);
      return c.json(fetchSlides(db, projectId, settings.language));
    }
    unstackSlides(db, projectId, slideIds);
    const settings = loadSettings(db, userId, projectId);
    return c.json(fetchSlides(db, projectId, settings.language));
  });

  return app;
}

// ---------------------------------------------------------------------------
// Command implementations (ported from src-tauri commands)
// ---------------------------------------------------------------------------

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function assertProjectOwned(db: Database, userId: string, projectId: string): void {
  loadSettings(db, userId, projectId); // throws ProjectNotFound when missing
}

function assertProjectsOwned(db: Database, userId: string, projectIds: string[]): void {
  if (projectIds.length === 0) return;
  const placeholders = projectIds.map(() => "?").join(", ");
  const rows = db
    .query(`SELECT id FROM projects WHERE id IN (${placeholders}) AND user_id = ?`)
    .all(...projectIds, userId) as Array<{ id: string }>;
  const found = new Set(rows.map((r) => r.id));
  for (const id of projectIds) {
    if (!found.has(id)) throw ApiError.notFound(`Presentation not found: ${id}`);
  }
}

function functionCreateProject(
  db: Database,
  userId: string,
  opts: { name?: string },
): Project {
  const projectId = crypto.randomUUID();
  const slideId = crypto.randomUUID();
  const ts = nowMs();
  const projectName = String(opts.name ?? "").trim() || "Untitled Presentation";
  const settings = defaultSettings({ currentSlideId: slideId });
  insertProject(db, userId, projectId, projectName, DEFAULT_THEME, settings, {
    createdAt: ts,
    updatedAt: ts,
  });
  insertSlide(db, {
    id: slideId,
    project_id: projectId,
    order_index: 0,
    code: DEFAULT_CODE,
    transition_duration: DEFAULT_SLIDE_TRANSITION_MS,
    stagger: DEFAULT_SLIDE_STAGGER,
    duration: DEFAULT_SLIDE_DURATION_MS,
    name: "1. Open with an idea",
    highlights_json: "[]",
    thumbnail_html: "",
    section_id: null,
    images_json: "[]",
  });
  return fetchProject(db, userId, projectId);
}

function duplicateProject(db: Database, userId: string, projectId: string): Project {
  const source = db
    .query("SELECT name, theme, settings FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as
    | { name: string; theme: string; settings: string }
    | undefined;
  if (!source) throw ApiError.notFound(`Presentation not found: ${projectId}`);

  const theme = isSupportedTheme(source.theme) ? source.theme : DEFAULT_THEME;
  const settings = parseSettings(source.settings);
  const slides = db
    .query(
      `SELECT id, order_index, code, transition_duration, stagger, duration, name, highlights, thumbnail_html, section_id, images
       FROM slides WHERE project_id = ? ORDER BY order_index`,
    )
    .all(projectId) as Array<{
    id: string;
    order_index: number;
    code: string;
    transition_duration: number;
    stagger: number;
    duration: number;
    name: string;
    highlights: string;
    thumbnail_html: string;
    section_id: string | null;
    images: string;
  }>;

  const newProjectId = crypto.randomUUID();
  const idMap = new Map<string, string>();
  for (const row of slides) idMap.set(row.id, crypto.randomUUID());
  settings.currentSlideId =
    idMap.get(settings.currentSlideId ?? "") ?? idMap.get(slides[0]?.id ?? "") ?? null;
  const ts = nowMs();
  insertProject(db, userId, newProjectId, `${source.name} Copy`, theme, settings, {
    createdAt: ts,
    updatedAt: ts,
  });

  const sectionMap = new Map<string, string>();
  for (const row of slides) {
    const newSec = remapSectionId(sectionMap, row.section_id);
    insertSlide(db, {
      id: idMap.get(row.id)!,
      project_id: newProjectId,
      order_index: row.order_index,
      code: row.code,
      transition_duration: row.transition_duration,
      stagger: row.stagger,
      duration: row.duration,
      name: row.name ?? "",
      highlights_json: normalizeCopiedSlideHighlights(row.highlights ?? "[]"),
      thumbnail_html: row.thumbnail_html ?? "",
      section_id: newSec,
      images_json: row.images ?? "[]",
    });
  }
  return fetchProject(db, userId, newProjectId);
}

function createSlide(
  db: Database,
  userId: string,
  projectId: string,
  opts: { code?: string; name?: string },
): Slide {
  const slideId = crypto.randomUUID();
  const code = opts.code ?? "// New Slide\n// Edit me!";
  const settings = loadSettings(db, userId, projectId);
  const language = settings.language;

  const maxOrder = db
    .query("SELECT MAX(order_index) AS m FROM slides WHERE project_id = ?")
    .get(projectId) as { m: number | null };
  const orderIndex = (maxOrder.m ?? -1) + 1;
  const name = makeSlideName(opts.name, orderIndex);

  insertSlide(db, {
    id: slideId,
    project_id: projectId,
    order_index: orderIndex,
    code,
    transition_duration: DEFAULT_SLIDE_TRANSITION_MS,
    stagger: DEFAULT_SLIDE_STAGGER,
    duration: DEFAULT_SLIDE_DURATION_MS,
    name,
    highlights_json: "[]",
    thumbnail_html: "",
    section_id: null,
    images_json: "[]",
  });

  settings.currentSlideId = slideId;
  saveSettings(db, projectId, settings, true);

  return {
    id: slideId,
    code,
    language,
    duration: DEFAULT_SLIDE_DURATION_MS,
    transitionDuration: DEFAULT_SLIDE_TRANSITION_MS,
    stagger: DEFAULT_SLIDE_STAGGER,
    orderIndex,
    name,
    highlights: [],
    thumbnailHtml: "",
    sectionId: null,
    images: [],
  };
}

function duplicateSlide(
  db: Database,
  userId: string,
  projectId: string,
  slideId: string,
): Project {
  const owned = fetchSlideOwned(db, userId, slideId);
  if (!owned || owned.project_id !== projectId) {
    throw ApiError.notFound(`Slide not found: ${slideId}`);
  }
  const newOrder = owned.order_index + 1;
  const newId = crypto.randomUUID();
  const origName = (owned.name ?? "").trim();
  const newName = !origName
    ? `Slide ${newOrder + 1} Copy`
    : origName.endsWith(" Copy")
      ? `${origName} 2`
      : `${origName} Copy`;

  db.query(
    "UPDATE slides SET order_index = order_index + 1 WHERE project_id = ? AND order_index > ?",
  ).run(projectId, owned.order_index);

  insertSlide(db, {
    id: newId,
    project_id: projectId,
    order_index: newOrder,
    code: owned.code,
    transition_duration: owned.transition_duration,
    stagger: owned.stagger,
    duration: owned.duration,
    name: newName,
    highlights_json: normalizeCopiedSlideHighlights(owned.highlights ?? "[]"),
    thumbnail_html: owned.thumbnail_html ?? "",
    section_id: owned.section_id,
    images_json: owned.images ?? "[]",
  });

  const settings = loadSettings(db, userId, projectId);
  settings.currentSlideId = newId;
  saveSettings(db, projectId, settings, true);

  return fetchProject(db, userId, projectId);
}

function deleteSlide(db: Database, userId: string, projectId: string, slideId: string): Project {
  const count = db
    .query("SELECT COUNT(*) AS n FROM slides WHERE project_id = ?")
    .get(projectId) as { n: number };
  if (count.n <= 1) throw ApiError.validation("Cannot delete the last slide");

  const owned = fetchSlideOwned(db, userId, slideId);
  if (!owned || owned.project_id !== projectId) {
    throw ApiError.notFound(`Slide not found: ${slideId}`);
  }

  db.query("DELETE FROM slides WHERE id = ? AND project_id = ?").run(slideId, projectId);

  const remaining = (
    db.query("SELECT id FROM slides WHERE project_id = ? ORDER BY order_index ASC").all(projectId) as Array<{ id: string }>
  ).map((r) => r.id);
  batchReindex(db, projectId, remaining);

  const settings = loadSettings(db, userId, projectId);
  if (settings.currentSlideId === slideId) {
    settings.currentSlideId = remaining[0] ?? null;
    saveSettings(db, projectId, settings, true);
  }

  return fetchProject(db, userId, projectId);
}

function restoreSlide(
  db: Database,
  userId: string,
  projectId: string,
  slideJson: Record<string, unknown>,
  insertAt: unknown,
): Project {
  const slideId = String(slideJson.id ?? "");
  if (!slideId.trim()) throw ApiError.validation("Slide ID is required for restore");

  // Reject writes to projects owned by another user.
  const projectCount = db
    .query("SELECT COUNT(*) AS n FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as { n: number };
  if (projectCount.n === 0) throw ApiError.notFound(`Project not found: ${projectId}`);
  const existingCount = db
    .query("SELECT COUNT(*) AS n FROM slides WHERE id = ?")
    .get(slideId) as { n: number };
  if (existingCount.n > 0) {
    throw ApiError.validation("Cannot restore a slide that already exists");
  }

  const orderIndex = Math.max(Number(insertAt ?? 0) || 0, 0);
  db.query(
    "UPDATE slides SET order_index = order_index + 1 WHERE project_id = ? AND order_index >= ?",
  ).run(projectId, orderIndex);

  const restoreName = slideJson.name && String(slideJson.name).trim()
    ? String(slideJson.name).trim()
    : makeSlideName(null, orderIndex);

  insertSlide(db, {
    id: slideId,
    project_id: projectId,
    order_index: orderIndex,
    code: String(slideJson.code ?? "// empty"),
    transition_duration: numOr(slideJson.transitionDuration, DEFAULT_SLIDE_TRANSITION_MS),
    stagger: numOr(slideJson.stagger, DEFAULT_SLIDE_STAGGER),
    duration: numOr(slideJson.duration, DEFAULT_SLIDE_DURATION_MS),
    name: restoreName,
    highlights_json: JSON.stringify(Array.isArray(slideJson.highlights) ? slideJson.highlights : []),
    thumbnail_html: "",
    section_id: typeof slideJson.sectionId === "string" ? slideJson.sectionId : null,
    images_json: JSON.stringify(Array.isArray(slideJson.images) ? slideJson.images : []),
  });
  touchProject(db, projectId);

  return fetchProject(db, userId, projectId);
}

function updateSlideSettings(
  db: Database,
  userId: string,
  slideId: string,
  payload: SlideSettingsPatch,
): Slide {
  const owned = fetchSlideOwned(db, userId, slideId);
  if (!owned) throw ApiError.notFound(`Slide not found: ${slideId}`);

  const duration = payload.duration ?? owned.duration;
  const transitionDuration = payload.transitionDuration ?? owned.transition_duration;
  const stagger = payload.stagger ?? owned.stagger;
  const name = payload.name ?? owned.name ?? "";
  const highlights = payload.highlights ?? JSON.parse(owned.highlights || "[]");
  const images = payload.images ?? JSON.parse(owned.images || "[]");

  db.query(
    `UPDATE slides
     SET duration = ?, transition_duration = ?, stagger = ?, name = ?, highlights = ?, images = ?
     WHERE id = ?`,
  ).run(duration, transitionDuration, stagger, name, JSON.stringify(highlights), JSON.stringify(images), slideId);

  touchProject(db, owned.project_id);
  const settings = loadSettings(db, userId, owned.project_id);

  return {
    id: slideId,
    code: owned.code,
    language: settings.language,
    duration,
    transitionDuration,
    stagger,
    orderIndex: owned.order_index,
    name,
    highlights,
    thumbnailHtml: owned.thumbnail_html ?? "",
    sectionId: owned.section_id,
    images,
  };
}

function buildExportJson(project: Project): Record<string, unknown> {
  const s = project.settings;
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    theme: project.theme,
    showLineNumbers: s.showLineNumbers,
    useBlackCodeBackground: s.useBlackCodeBackground,
    showHighlightStepIndicator: s.showHighlightStepIndicator,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    editorFontSize: s.editorFontSize,
    useGlobalTransition: s.useGlobalTransition,
    globalTransitionDuration: s.globalTransitionDuration,
    useGlobalStagger: s.useGlobalStagger,
    globalStagger: s.globalStagger,
    useGlobalHighlight: s.useGlobalHighlight,
    globalDimAmount: s.globalDimAmount,
    globalSizeUpAmount: s.globalSizeUpAmount,
    highlightDimColor: s.highlightDimColor,
    currentSlideId: s.currentSlideId,
    language: s.language,
    codeAlign: s.codeAlign,
    slides: project.slides.map((slide) => ({
      id: slide.id,
      code: slide.code,
      language: project.settings.language,
      duration: slide.duration,
      transitionDuration: slide.transitionDuration,
      stagger: slide.stagger,
      name: slide.name,
      highlights: slide.highlights,
      sectionId: slide.sectionId,
      images: slide.images,
    })),
  };
}

function importProject(db: Database, userId: string, raw: Record<string, unknown>): Project {
  const name = String(raw.name ?? "").trim() || "Imported Presentation";
  const theme = isSupportedTheme(String(raw.theme ?? "")) ? String(raw.theme) : DEFAULT_THEME;
  const slidesVal = Array.isArray(raw.slides) ? raw.slides : [];
  if (slidesVal.length === 0) {
    throw ApiError.error("This file doesn't contain any slides");
  }

  const language = normalizeLanguage(
    typeof raw.language === "string"
      ? raw.language
      : typeof slidesVal[0]?.["language"] === "string"
        ? String(slidesVal[0]["language"])
        : "",
  );
  const codeAlign = normalizeCodeAlign(typeof raw.codeAlign === "string" ? raw.codeAlign : undefined);

  const settings = defaultSettings({
    showLineNumbers: typeof raw.showLineNumbers === "boolean" ? raw.showLineNumbers : undefined,
    useBlackCodeBackground: typeof raw.useBlackCodeBackground === "boolean" ? raw.useBlackCodeBackground : undefined,
    showHighlightStepIndicator: typeof raw.showHighlightStepIndicator === "boolean" ? raw.showHighlightStepIndicator : undefined,
    fontSize: numOr(raw.fontSize, undefined),
    lineHeight: numOr(raw.lineHeight, undefined),
    editorFontSize: numOr(raw.editorFontSize, undefined),
    useGlobalTransition: typeof raw.useGlobalTransition === "boolean" ? raw.useGlobalTransition : undefined,
    globalTransitionDuration: numOr(raw.globalTransitionDuration, undefined),
    useGlobalStagger: typeof raw.useGlobalStagger === "boolean" ? raw.useGlobalStagger : undefined,
    globalStagger: numOr(raw.globalStagger, undefined),
    useGlobalHighlight: typeof raw.useGlobalHighlight === "boolean" ? raw.useGlobalHighlight : undefined,
    globalDimAmount: numOr(raw.globalDimAmount, undefined),
    globalSizeUpAmount: numOr(raw.globalSizeUpAmount, undefined),
    highlightDimColor: typeof raw.highlightDimColor === "string" ? raw.highlightDimColor : undefined,
    currentSlideId: null,
    language,
    codeAlign,
  });

  const projectId = crypto.randomUUID();
  const ts = nowMs();

  const importedSlideIds = new Map<string, string>();
  const importedSectionIds = new Map<string, string>();
  const parsed: NewSlide[] = [];
  slidesVal.forEach((slideValue, i) => {
    const slide = slideValue as Record<string, unknown>;
    const id = crypto.randomUUID();
    if (typeof slide.id === "string" && slide.id.trim()) importedSlideIds.set(slide.id, id);
    const sname = typeof slide.name === "string" && slide.name.trim()
      ? slide.name.trim()
      : `Slide ${i + 1}`;
    const highlightsJson = normalizeImportedHighlights(slide);
    if (i === 0) settings.currentSlideId = id;
    parsed.push({
      id,
      project_id: projectId,
      order_index: i,
      code: String(slide.code ?? "// empty"),
      transition_duration: numOr(slide.transitionDuration, DEFAULT_SLIDE_TRANSITION_MS),
      stagger: numOr(slide.stagger, DEFAULT_SLIDE_STAGGER),
      duration: numOr(slide.duration, DEFAULT_SLIDE_DURATION_MS),
      name: sname,
      highlights_json: highlightsJson,
      thumbnail_html: "",
      section_id: remapSectionId(
        importedSectionIds,
        typeof slide.sectionId === "string" ? slide.sectionId : null,
      ),
      images_json: JSON.stringify(Array.isArray(slide.images) ? slide.images : []),
    });
  });

  if (typeof raw.currentSlideId === "string") {
    settings.currentSlideId = importedSlideIds.get(raw.currentSlideId) ?? settings.currentSlideId;
  }

  insertProject(db, userId, projectId, name, theme, settings, {
    createdAt: ts,
    updatedAt: ts,
  });
  for (const slide of parsed) insertSlide(db, slide);

  return fetchProject(db, userId, projectId);
}

function searchSlides(db: Database, projectId: string, query: string): string[] {
  const needle = query.trim();
  if (!needle) return [];

  const explicitFts =
    needle.includes(":") ||
    needle.includes("*") ||
    needle.includes('"') ||
    needle.split(/\s+/).some((t) => t === "AND" || t === "OR" || t === "NOT");
  const primary = explicitFts ? needle : safePrefixQuery(needle);

  if (primary) {
    try {
      const rows = db
        .query(
          `SELECT slides.id
           FROM slides_fts
           JOIN slides ON slides.rowid = slides_fts.rowid
           WHERE slides_fts MATCH ? AND slides.project_id = ?
           ORDER BY bm25(slides_fts)
           LIMIT 50`,
        )
        .all(primary, projectId) as Array<{ id: string }>;
      if (rows.length > 0 || !hasLiteralPunctuation(needle)) {
        return rows.map((r) => r.id);
      }
    } catch {
      const safe = safePrefixQuery(needle);
      if (safe && safe !== primary) {
        try {
          const rows = db
            .query(
              `SELECT slides.id
               FROM slides_fts
               JOIN slides ON slides.rowid = slides_fts.rowid
               WHERE slides_fts MATCH ? AND slides.project_id = ?
               ORDER BY bm25(slides_fts)
               LIMIT 50`,
            )
            .all(safe, projectId) as Array<{ id: string }>;
          if (rows.length > 0 || !hasLiteralPunctuation(needle)) {
            return rows.map((r) => r.id);
          }
        } catch {
          /* fall through to literal search */
        }
      }
    }
  }

  const pattern = `%${escapeLikePattern(needle.toLowerCase())}%`;
  const rows = db
    .query(
      `SELECT id
       FROM slides
       WHERE project_id = ?
         AND (lower(code) LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\')
       ORDER BY order_index
       LIMIT 50`,
    )
    .all(projectId, pattern, pattern) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

function safePrefixQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((term) => term.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 0)
    .map((t) => `${t}*`)
    .join(" ");
}

function hasLiteralPunctuation(query: string): boolean {
  return query.split("").some((ch) => !/[A-Za-z0-9_\s]/.test(ch));
}

function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// --- Project stacks (groups) ---
function stackProjects(
  db: Database,
  targetId: string,
  sourceIds: string[],
): void {
  const target = db
    .query("SELECT group_id FROM projects WHERE id = ?")
    .get(targetId) as { group_id: string | null } | null;

  const existingGroupId = target?.group_id?.trim() || null;
  let targetGroupId: string;
  let nextOrder: number;
  if (existingGroupId) {
    const maxOrder = db
      .query("SELECT MAX(group_order) AS m FROM projects WHERE group_id = ?")
      .get(existingGroupId) as { m: number | null };
    targetGroupId = existingGroupId;
    nextOrder = (maxOrder.m ?? -1) + 1;
  } else {
    targetGroupId = crypto.randomUUID();
    db.query("UPDATE projects SET group_id = ?, group_order = 0 WHERE id = ?").run(
      targetGroupId,
      targetId,
    );
    nextOrder = 1;
  }

  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;
    db.query("UPDATE projects SET group_id = ?, group_order = ? WHERE id = ?").run(
      targetGroupId,
      nextOrder,
      sourceId,
    );
    nextOrder += 1;
  }

  cleanupSingleItemProjectGroups(db);
}

function unstackProjects(db: Database, projectIds: string[]): void {
  for (const id of projectIds) {
    db.query("UPDATE projects SET group_id = NULL, group_order = 0 WHERE id = ?").run(id);
  }
  cleanupSingleItemProjectGroups(db);
}

function cleanupSingleItemProjectGroups(db: Database): void {
  const singleGroups = db
    .query(
      `SELECT group_id FROM projects
       WHERE group_id IS NOT NULL AND group_id != ''
       GROUP BY group_id HAVING COUNT(*) <= 1`,
    )
    .all() as Array<{ group_id: string }>;
  for (const { group_id } of singleGroups) {
    db.query("UPDATE projects SET group_id = NULL, group_order = 0 WHERE group_id = ?").run(
      group_id,
    );
  }
  const groups = db
    .query(
      `SELECT DISTINCT group_id FROM projects
       WHERE group_id IS NOT NULL AND group_id != ''`,
    )
    .all() as Array<{ group_id: string }>;
  for (const { group_id } of groups) {
    const members = db
      .query(
        `SELECT id FROM projects WHERE group_id = ? ORDER BY group_order ASC, updated_at DESC`,
      )
      .all(group_id) as Array<{ id: string }>;
    members.forEach((member, idx) => {
      db.query("UPDATE projects SET group_order = ? WHERE id = ?").run(idx, member.id);
    });
  }
}

// --- Slide stacks (sections) ---
function stackSlides(
  db: Database,
  projectId: string,
  sourceIds: string[],
  targetId: string,
): void {
  const target = db
    .query("SELECT order_index, section_id FROM slides WHERE id = ? AND project_id = ?")
    .get(targetId, projectId) as { order_index: number; section_id: string | null } | null;
  if (!target) throw ApiError.notFound(`Slide not found: ${targetId}`);

  const existingSection = target.section_id?.trim() || null;
  let targetSec: string;
  if (existingSection) {
    targetSec = existingSection;
  } else {
    targetSec = crypto.randomUUID();
    db.query("UPDATE slides SET section_id = ? WHERE id = ? AND project_id = ?").run(
      targetSec,
      targetId,
      projectId,
    );
  }

  const maxSecOrder = db
    .query("SELECT MAX(order_index) AS m FROM slides WHERE project_id = ? AND section_id = ?")
    .get(projectId, targetSec) as { m: number | null };
  const insertAt = (maxSecOrder.m ?? target.order_index) + 1;

  sourceIds.forEach((sid, i) => {
    db.query(
      "UPDATE slides SET order_index = ?, section_id = ? WHERE id = ? AND project_id = ?",
    ).run(-1000 - i, targetSec, sid, projectId);
  });

  const shift = sourceIds.length;
  db.query(
    "UPDATE slides SET order_index = order_index + ? WHERE project_id = ? AND order_index >= ? AND order_index >= 0",
  ).run(shift, projectId, insertAt);

  sourceIds.forEach((sid, i) => {
    db.query("UPDATE slides SET order_index = ? WHERE id = ? AND project_id = ?").run(
      insertAt + i,
      sid,
      projectId,
    );
  });

  cleanupSingleItemSlideSections(db, projectId);
}

function unstackSlides(db: Database, projectId: string, slideIds: string[]): void {
  for (const id of slideIds) {
    db.query("UPDATE slides SET section_id = NULL WHERE id = ? AND project_id = ?").run(
      id,
      projectId,
    );
  }
  cleanupSingleItemSlideSections(db, projectId);
}

function cleanupSingleItemSlideSections(db: Database, projectId: string): void {
  const singleSections = db
    .query(
      `SELECT section_id FROM slides
       WHERE project_id = ? AND section_id IS NOT NULL AND section_id != ''
       GROUP BY section_id HAVING COUNT(*) <= 1`,
    )
    .all(projectId) as Array<{ section_id: string }>;
  for (const { section_id } of singleSections) {
    db.query("UPDATE slides SET section_id = NULL WHERE project_id = ? AND section_id = ?").run(
      projectId,
      section_id,
    );
  }
  const ordered = db
    .query("SELECT id FROM slides WHERE project_id = ? ORDER BY order_index ASC")
    .all(projectId) as Array<{ id: string }>;
  ordered.forEach((row, idx) => {
    db.query("UPDATE slides SET order_index = ? WHERE id = ? AND project_id = ?").run(
      idx,
      row.id,
      projectId,
    );
  });
}

function numOr(value: unknown, fallback: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback ?? 0;
}