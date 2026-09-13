/**
 * HTTP bridge to the DevSlidesOnline server.
 * All persistent mutations go through these helpers.
 *
 * The method/argument surface mirrors the original desktop app's IPC bridge
 * (Bun server REST endpoints now) so the rest of the frontend is agnostic to
 * the transport — this file is the only place that knows about `fetch`.
 */
import type {
  Highlight,
  Project,
  ProjectSummary,
  ProjectSettings,
  Slide,
  SlideImage,
} from "$lib/types";
import type { LanguageOption } from "$lib/lib/language-meta";
import type { ThemeMeta } from "$lib/lib/theme-meta";

export type SlideSettingsPatch = Partial<{
  duration: number;
  transitionDuration: number;
  stagger: number;
  name: string;
  highlights: Highlight[];
  images: SlideImage[];
}>;

export type SettingsPatch = Partial<ProjectSettings>;

/** App metadata returned by the server (`GET /api/meta/app-info`). */
export interface AppInfo {
  name: string;
  version: string;
  description: string;
  repository: string;
}

/** Result of an update check against the latest GitHub release. */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean;
  checkError: string | null;
}

/** Error codes the backend sends in its structured { code, message } shape. */
type CommandErrorCode =
  "CANCELLED" | "NOT_FOUND" | "VALIDATION" | "ERROR" | "UNAUTHORIZED";

interface CommandErrorShape {
  code?: CommandErrorCode;
  message?: string;
}

interface CommandError extends Error {
  code?: CommandErrorCode;
}

/** True when the server reported a user cancellation — callers stay silent. */
export function isCancelledError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "CANCELLED"
  );
}

function normalizeCommandError(err: unknown): CommandError {
  if (typeof err === "object" && err !== null) {
    const e = err as CommandErrorShape;
    if (typeof e.message === "string") {
      const out: CommandError = new Error(e.message);
      if (e.code) out.code = e.code;
      return out;
    }
  }
  if (typeof err === "string") return new Error(err);
  return new Error((err as Error)?.message ?? String(err));
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
}

async function toCommandError(res: Response): Promise<CommandError> {
  let shape: CommandErrorShape = {};
  try {
    shape = (await res.json()) as CommandErrorShape;
  } catch {
    /* not JSON */
  }
  const out: CommandError = new Error(
    shape.message || `Request failed (${res.status})`,
  );
  if (shape.code) out.code = shape.code;
  return out;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, init);
  } catch (err) {
    throw normalizeCommandError(err);
  }
  if (res.status === 401) {
    // Session cookie expired/unauthenticated mid-flight — the auth gate
    // (session.svelte.ts) listens for this and returns to the login screen.
    window.dispatchEvent(new Event("devslides:session-expired"));
  }
  if (!res.ok) throw await toCommandError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function triggerDownload(
  filename: string,
  content: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .split("")
    .map((c) => (/[A-Za-z0-9-_ ]/.test(c) ? c : "_"))
    .join("");
  const stem = cleaned.trim() || "devslides-export";
  return stem.replace(/ /g, "-").slice(0, 80);
}

/** Prompt for a file via a hidden input; resolves with its data URL (or null). */
function pickFileAsDataUrl(accept: string, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(""); // cancelled
        return;
      }
      if (file.size > maxBytes) {
        reject(
          new Error(
            "That image is larger than 12 MB — DevSlides keeps images embedded in the project, so try a smaller file.",
          ),
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () =>
        reject(new Error("Failed to read the selected file"));
      reader.readAsDataURL(file);
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve("");
    });
    document.body.appendChild(input);
    input.click();
  });
}

const ALLOWED_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
]);

/** Reads a PNG data URL from the clipboard if the browser exposes one. */
async function readClipboardImage(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.read) return null;
    if (typeof ClipboardItem === "undefined") return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () =>
          reject(new Error("Failed to read clipboard image"));
        reader.readAsDataURL(blob);
      });
      if (dataUrl && dataUrl.length > 12 * 1024 * 1024) {
        throw new Error(
          "That clipboard image is larger than 12 MB — try a smaller image.",
        );
      }
      return dataUrl;
    }
    return null;
  } catch {
    return null;
  }
}

export const api = {
  getProjects: () => request<ProjectSummary[]>("GET", "/api/projects"),

  getProject: (projectId: string) =>
    request<Project>("GET", `/api/projects/${encodeURIComponent(projectId)}`),

  getDefaultSettings: <T = ProjectSettings>() =>
    request<T>("GET", "/api/meta/default-settings"),

  getSupportedLanguages: () =>
    request<LanguageOption[]>("GET", "/api/meta/languages"),

  getSupportedThemes: () => request<ThemeMeta[]>("GET", "/api/meta/themes"),

  createProject: (name: string) =>
    request<Project>("POST", "/api/projects", { name }),

  renameProject: (projectId: string, name: string) =>
    request<Project>(
      "PATCH",
      `/api/projects/${encodeURIComponent(projectId)}`,
      { name },
    ),

  duplicateProject: (projectId: string) =>
    request<Project>(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/duplicate`,
    ),

  deleteProject: (projectId: string) =>
    request<void>("DELETE", `/api/projects/${encodeURIComponent(projectId)}`),

  updateProjectSettings: (projectId: string, settings: SettingsPatch) =>
    request<Project>(
      "PATCH",
      `/api/projects/${encodeURIComponent(projectId)}/settings`,
      {
        settings,
      },
    ),

  updateProjectTheme: (projectId: string, theme: string) =>
    request<Project>(
      "PATCH",
      `/api/projects/${encodeURIComponent(projectId)}/theme`,
      {
        theme,
      },
    ),

  createSlide: (projectId: string, opts?: { code?: string; name?: string }) =>
    request<Slide>(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/slides`,
      {
        code: opts?.code,
        name: opts?.name,
      },
    ),

  deleteSlide: (projectId: string, slideId: string) =>
    request<Project>(
      "DELETE",
      `/api/projects/${encodeURIComponent(projectId)}/slides/${encodeURIComponent(slideId)}`,
    ),

  duplicateSlide: (projectId: string, slideId: string) =>
    request<Project>(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/slides/${encodeURIComponent(slideId)}/duplicate`,
    ),

  restoreSlide: (projectId: string, slide: Slide, insertAt?: number) =>
    request<Project>(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/slides/restore`,
      { slide, insertAt },
    ),

  updateSlideCode: (slideId: string, code: string) =>
    request<void>("PATCH", `/api/slides/${encodeURIComponent(slideId)}/code`, {
      code,
    }),

  cacheThumbnail: (slideId: string, code: string, html: string) =>
    request<void>(
      "PUT",
      `/api/slides/${encodeURIComponent(slideId)}/thumbnail`,
      {
        code,
        html,
      },
    ),

  updateSlideSettings: (slideId: string, payload: SlideSettingsPatch) =>
    request<Slide>(
      "PATCH",
      `/api/slides/${encodeURIComponent(slideId)}/settings`,
      payload,
    ),

  reorderSlides: (projectId: string, slideIds: string[]) =>
    request<Project>(
      "PUT",
      `/api/projects/${encodeURIComponent(projectId)}/slides/order`,
      {
        slideIds,
      },
    ),

  setCurrentSlide: (projectId: string, slideId: string) =>
    request<void>(
      "PUT",
      `/api/projects/${encodeURIComponent(projectId)}/current-slide`,
      { slideId },
    ),

  /** Fetch the export JSON and trigger a browser download; returns the filename. */
  exportProjectToJson: async (projectId: string): Promise<string> => {
    const { filename, content } = await request<{
      filename: string;
      content: string;
    }>("GET", `/api/projects/${encodeURIComponent(projectId)}/export.json`);
    triggerDownload(filename, content, "application/json");
    return filename;
  },

  /** Trigger a browser download of the finished PDF; returns the filename. */
  exportPdf: async (bytesB64: string, projectName: string): Promise<string> => {
    const bytes = base64ToBytes(bytesB64);
    if (bytes.length === 0) throw new Error("PDF data is empty");
    const filename = `${sanitizeFilename(projectName)}.pdf`;
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
  },

  /** Prompt for a JSON file and import it as a new presentation. */
  importProjectFromJson: async (): Promise<Project> => {
    const dataUrl = await pickFileAsDataUrl(
      ".json,application/json",
      50 * 1024 * 1024,
    );
    if (!dataUrl) throw cancelledError("Import cancelled");
    const payloadBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    let payload: unknown;
    try {
      payload = JSON.parse(
        new TextDecoder().decode(base64ToBytes(payloadBase64)),
      );
    } catch {
      throw new Error("That file isn't a valid presentation file");
    }
    return request<Project>("POST", "/api/projects/import", payload);
  },

  /** Pick an image from the filesystem; returns an embedded data URL. */
  pickImageFile: async (): Promise<string> => {
    const dataUrl = await pickFileAsDataUrl(
      "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif",
      12 * 1024 * 1024,
    );
    if (!dataUrl) throw cancelledError("Image selection cancelled");
    const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new Error(
        "Unsupported image format — choose PNG, JPEG, GIF, WebP, BMP or AVIF",
      );
    }
    return dataUrl;
  },

  /** Read an image from the system clipboard (if any) as a PNG data URL. */
  readClipboardImage: () => readClipboardImage(),

  searchSlides: (projectId: string, query: string) =>
    request<string[]>(
      "GET",
      `/api/projects/${encodeURIComponent(projectId)}/search?q=${encodeURIComponent(query)}`,
    ),

  stackProjects: (sourceIds: string[], targetId: string) =>
    request<ProjectSummary[]>("POST", "/api/stacks/projects", {
      sourceIds,
      targetId,
    }),

  unstackProjects: (projectIds: string[]) =>
    request<ProjectSummary[]>("DELETE", "/api/stacks/projects", { projectIds }),

  stackSlides: (projectId: string, sourceIds: string[], targetId: string) =>
    request<Slide[]>("POST", "/api/stacks/slides", {
      projectId,
      sourceIds,
      targetId,
    }),

  unstackSlides: (projectId: string, slideIds: string[]) =>
    request<Slide[]>("DELETE", "/api/stacks/slides", { projectId, slideIds }),

  getAppInfo: () => request<AppInfo>("GET", "/api/meta/app-info"),

  /** Open an external URL in a new tab. */
  openUrl: (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },

  /** Check whether a newer release exists (client-side GitHub API query). */
  checkForUpdates: async (): Promise<UpdateInfo> => {
    const base = "https://github.com/alyohara/DevSlidesOnline";
    let currentVersion = "0.0.0";
    try {
      const info = await api.getAppInfo();
      currentVersion = info.version;
    } catch {
      /* fall back to the static version */
    }
    try {
      const res = await fetch(
        `${base.replace("github.com", "api.github.com/repos")}/releases/latest`,
      );
      if (!res.ok) throw new Error(`GitHub responded with ${res.status}`);
      const release = (await res.json()) as {
        tag_name?: string;
        html_url?: string;
        body?: string;
      };
      const latest = (release.tag_name ?? "").replace(/^v/, "");
      const updateAvailable = latest !== "" && latest !== currentVersion;
      return {
        currentVersion,
        latestVersion: latest || null,
        releaseUrl: release.html_url ?? null,
        releaseNotes: release.body ?? null,
        updateAvailable,
        checkError: null,
      };
    } catch (err) {
      return {
        currentVersion,
        latestVersion: null,
        releaseUrl: null,
        releaseNotes: null,
        updateAvailable: false,
        checkError: (err as Error)?.message ?? "Update check failed",
      };
    }
  },
};

function cancelledError(message: string): CommandError {
  const err = new Error(message) as CommandError;
  err.code = "CANCELLED";
  return err;
}
