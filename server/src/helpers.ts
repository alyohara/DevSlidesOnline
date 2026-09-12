import type { Database } from "bun:sqlite";
import {
  defaultSettings,
  defaultSlideName,
  DEFAULT_LANGUAGE,
  mergeSettings,
  nowMs,
  parseSettings,
  type Highlight,
  type Project,
  type ProjectSettings,
  type ProjectSummary,
  type Slide,
  type SlideImage,
} from "./models";

export interface SlideRow {
  id: string;
  code: string;
  duration: number;
  transition_duration: number;
  stagger: number;
  order_index: number;
  name: string;
  highlights: string;
  thumbnail_html: string;
  section_id: string | null;
  images: string;
}

export interface NewSlide {
  id: string;
  project_id: string;
  order_index: number;
  code: string;
  transition_duration: number;
  stagger: number;
  duration: number;
  name: string;
  highlights_json: string;
  thumbnail_html: string;
  section_id: string | null;
  images_json: string;
}

export function ensureCurrentSlide(
  settings: ProjectSettings,
  slides: Slide[],
): void {
  const valid = settings.currentSlideId !== null &&
    slides.some((s) => s.id === settings.currentSlideId);
  if (!valid) settings.currentSlideId = slides[0]?.id ?? null;
}

export function parseHighlights(raw: string | null | undefined): Highlight[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "[]") return [];
  try {
    return JSON.parse(raw!) as Highlight[];
  } catch {
    return [];
  }
}

export function serializeHighlights(highlights: Highlight[]): string {
  return JSON.stringify(highlights);
}

export function parseImages(raw: string | null | undefined): SlideImage[] {
  if (!raw?.trim()) return [];
  try {
    return JSON.parse(raw) as SlideImage[];
  } catch {
    return [];
  }
}

export function serializeImages(images: SlideImage[]): string {
  return JSON.stringify(images);
}

/** Remap every highlight ID — copied/imported slides must never share IDs. */
export function remapHighlightIds(raw: string): string {
  const highlights = parseHighlights(raw);
  for (const h of highlights) h.id = crypto.randomUUID();
  return serializeHighlights(highlights);
}

/** Section/stack IDs stay consistent within a copy but fresh in the target. */
export function remapSectionId(
  sectionMap: Map<string, string>,
  sourceSectionId: string | null | undefined,
): string | null {
  if (!sourceSectionId) return null;
  const trimmed = sourceSectionId.trim();
  if (!trimmed) return null;
  let mapped = sectionMap.get(trimmed);
  if (!mapped) {
    mapped = crypto.randomUUID();
    sectionMap.set(trimmed, mapped);
  }
  return mapped;
}

export function normalizeCopiedSlideHighlights(raw: string): string {
  return remapHighlightIds(raw);
}

/** Normalize an imported slide's highlights before inserting into the DB. */
export function normalizeImportedHighlights(slide: {
  highlights?: unknown;
}): string {
  const raw = JSON.stringify(slide.highlights ?? []) ?? "[]";
  return normalizeCopiedSlideHighlights(raw);
}

export function fetchSlides(
  db: Database,
  projectId: string,
  language: string,
): Slide[] {
  const rows = db
    .query(
      `SELECT id, code, duration, transition_duration, stagger, order_index, name, highlights, thumbnail_html, section_id, images
       FROM slides
       WHERE project_id = ?
       ORDER BY order_index ASC`,
    )
    .all(projectId) as Array<SlideRow>;

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    language,
    duration: r.duration,
    transitionDuration: r.transition_duration,
    stagger: r.stagger,
    orderIndex: r.order_index,
    name: r.name ?? "",
    highlights: parseHighlights(r.highlights),
    thumbnailHtml: r.thumbnail_html ?? "",
    sectionId: r.section_id,
    images: parseImages(r.images),
  }));
}

/** Fetch a slide row with its owning project id, scoped to the user. */
export function fetchSlideOwned(
  db: Database,
  userId: string,
  slideId: string,
): (SlideRow & { project_id: string }) | null {
  return (db
    .query(
      `SELECT s.* FROM slides s
       JOIN projects p ON p.id = s.project_id
       WHERE s.id = ? AND p.user_id = ?`,
    )
    .get(slideId, userId) as (SlideRow & { project_id: string }) | undefined) ?? null;
}

export function fetchProject(
  db: Database,
  userId: string,
  projectId: string,
): Project {
  const row = db
    .query(
      `SELECT id, name, theme, settings, created_at, updated_at
       FROM projects WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as
    | { id: string; name: string; theme: string; settings: string; created_at: number; updated_at: number }
    | undefined;
  if (!row) throw new ProjectNotFound(projectId);

  const settings = parseSettings(row.settings);
  const slides = fetchSlides(db, projectId, settings.language);
  ensureCurrentSlide(settings, slides);

  return {
    id: row.id,
    name: row.name,
    theme: row.theme,
    settings,
    slides,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Load + parse the settings JSON blob of a project (ownership-checked). */
export function loadSettings(db: Database, userId: string, projectId: string): ProjectSettings {
  const row = db
    .query("SELECT settings FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as { settings: string } | undefined;
  if (!row) throw new ProjectNotFound(projectId);
  return parseSettings(row.settings);
}

/** Persist settings JSON back to the project row. `touch` also bumps updated_at. */
export function saveSettings(
  db: Database,
  projectId: string,
  settings: ProjectSettings,
  touch: boolean,
): void {
  const json = JSON.stringify(settings);
  if (touch) {
    db.query("UPDATE projects SET settings = ?, updated_at = ? WHERE id = ?").run(
      json,
      nowMs(),
      projectId,
    );
  } else {
    db.query("UPDATE projects SET settings = ? WHERE id = ?").run(json, projectId);
  }
}

export function touchProject(db: Database, projectId: string): void {
  db.query("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowMs(), projectId);
}

export function invalidateProjectThumbnails(db: Database, projectId: string): void {
  db.query("UPDATE slides SET thumbnail_html = '' WHERE project_id = ?").run(projectId);
}

export function insertSlide(db: Database, slide: NewSlide): void {
  db.query(
    `INSERT INTO slides
       (id, project_id, order_index, code, transition_duration, stagger, duration, name, highlights, thumbnail_html, section_id, images)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    slide.id,
    slide.project_id,
    slide.order_index,
    slide.code,
    slide.transition_duration,
    slide.stagger,
    slide.duration,
    slide.name,
    slide.highlights_json,
    slide.thumbnail_html,
    slide.section_id,
    slide.images_json,
  );
}

export function batchReindex(db: Database, projectId: string, ids: string[]): void {
  ids.forEach((id, index) => {
    db.query("UPDATE slides SET order_index = ? WHERE id = ? AND project_id = ?").run(
      index,
      id,
      projectId,
    );
  });
}

/** Merge a JSON patch into a project's stored settings. */
export function updateSettingsJson(
  db: Database,
  userId: string,
  projectId: string,
  patch: Record<string, unknown>,
): ProjectSettings {
  const existing = loadSettings(db, userId, projectId);
  const merged = mergeSettings(existing, patch);
  saveSettings(db, projectId, merged, true);
  if (patch.language !== undefined && merged.language !== existing.language) {
    invalidateProjectThumbnails(db, projectId);
  }
  return merged;
}

export function getProjectSummaries(db: Database, userId: string): ProjectSummary[] {
  const rows = db
    .query(
      `SELECT p.id, p.name, p.theme, p.created_at, p.updated_at, p.group_id, p.group_order,
              (SELECT COUNT(*) FROM slides s WHERE s.project_id = p.id) AS slide_count,
              COALESCE(json_extract(p.settings, '$.language'), 'typescript') AS language,
              (SELECT s.id FROM slides s WHERE s.project_id = p.id ORDER BY s.order_index ASC LIMIT 1) AS first_slide_id,
              COALESCE((SELECT substr(s.code, 1, 400) FROM slides s WHERE s.project_id = p.id ORDER BY s.order_index ASC LIMIT 1), '') AS first_slide_code,
              COALESCE((SELECT s.thumbnail_html FROM slides s WHERE s.project_id = p.id ORDER BY s.order_index ASC LIMIT 1), '') AS first_slide_thumbnail
       FROM projects p
       WHERE p.user_id = ?
       ORDER BY
         COALESCE((SELECT MAX(p2.updated_at) FROM projects p2 WHERE p2.user_id = ? AND p2.group_id IS NOT NULL AND p2.group_id != '' AND p2.group_id = p.group_id), p.updated_at) DESC,
         COALESCE(p.group_id, p.id) ASC,
         p.group_order ASC`,
    )
    .all(userId, userId) as Array<{
    id: string;
    name: string;
    theme: string;
    created_at: number;
    updated_at: number;
    group_id: string | null;
    group_order: number;
    slide_count: number;
    language: string;
    first_slide_id: string | null;
    first_slide_code: string | null;
    first_slide_thumbnail: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    theme: r.theme,
    slideCount: r.slide_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    language: r.language ?? DEFAULT_LANGUAGE,
    firstSlideId: r.first_slide_id ?? "",
    firstSlideCode: r.first_slide_code ?? "",
    firstSlideThumbnail: r.first_slide_thumbnail ?? "",
    groupId: r.group_id,
    groupOrder: r.group_order,
  }));
}

/** Create a bare project row (settings JSON pre-baked). Used by new/import. */
export function insertProject(
  db: Database,
  userId: string,
  projectId: string,
  name: string,
  theme: string,
  settings: ProjectSettings,
  timestamps: { createdAt: number; updatedAt: number },
): void {
  db.query(
    `INSERT INTO projects (id, user_id, name, theme, settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    userId,
    name,
    theme,
    JSON.stringify(settings),
    timestamps.createdAt,
    timestamps.updatedAt,
  );
}

export function makeSlideName(name: string | null | undefined, orderIndex: number): string {
  const trimmed = (name ?? "").trim();
  return trimmed || defaultSlideName(orderIndex);
}

export class ProjectNotFound extends Error {
  constructor(projectId: string) {
    super(`Presentation not found: ${projectId}`);
    this.name = "ProjectNotFound";
  }
}