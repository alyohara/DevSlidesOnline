// Shared domain models for the DevSlidesOnline server.
// Mirrors src-tauri/src/models.rs + commands/shared/naming.rs (camelCase wire
// contract) so the frontend's types and IPC expectations stay identical.

export const DEFAULT_SLIDE_DURATION_MS = 3000;
export const DEFAULT_SLIDE_TRANSITION_MS = 750;
export const DEFAULT_SLIDE_STAGGER = 5;

export const DEFAULT_CODE = `// Every presentation starts with one clear idea.
const opening = "Make code memorable";

console.log(opening);`;

export const DEFAULT_LANGUAGE = "typescript";
export const DEFAULT_THEME = "dark-plus";

export interface HighlightStyle {
  dimAmount: number;
  sizeUpEnabled: boolean;
  sizeUpAmount: number;
  useCustomTransition: boolean;
  dimTransition: number;
  sizeUpTransition: number;
}

export interface Highlight extends HighlightStyle {
  id: string;
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

export interface SlideImage {
  id: string;
  src: string;
  role: "background" | "element";
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  zIndex: number;
  opacity: number;
}

export interface Slide {
  id: string;
  code: string;
  language: string;
  duration: number;
  transitionDuration: number;
  stagger: number;
  orderIndex: number;
  name: string;
  highlights: Highlight[];
  thumbnailHtml: string;
  sectionId: string | null;
  images: SlideImage[];
}

export interface ProjectSettings {
  showLineNumbers: boolean;
  useBlackCodeBackground: boolean;
  showHighlightStepIndicator: boolean;
  fontSize: number;
  lineHeight: number;
  editorFontSize: number;
  useGlobalTransition: boolean;
  globalTransitionDuration: number;
  useGlobalStagger: boolean;
  globalStagger: number;
  useGlobalHighlight: boolean;
  globalDimAmount: number;
  globalSizeUpAmount: number;
  highlightDimColor: string;
  currentSlideId: string | null;
  language: string;
  codeAlign: string;
}

export interface Project {
  id: string;
  name: string;
  theme: string;
  settings: ProjectSettings;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  theme: string;
  slideCount: number;
  createdAt: number;
  updatedAt: number;
  language: string;
  firstSlideId: string;
  firstSlideCode: string;
  firstSlideThumbnail: string;
  groupId: string | null;
  groupOrder: number;
}

export interface UpdateSlideSettingsPayload {
  duration?: number;
  transitionDuration?: number;
  stagger?: number;
  name?: string;
  highlights?: Highlight[];
  images?: SlideImage[];
}

export interface CreateSlidePayload {
  projectId: string;
  code?: string;
  name?: string;
}

export type SlideSettingsPatch = Partial<
  Pick<
    Slide,
    "duration" | "transitionDuration" | "stagger" | "name" | "highlights" | "images"
  >
>;

export type SettingsPatch = Partial<ProjectSettings>;

export function defaultSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    showLineNumbers: true,
    useBlackCodeBackground: false,
    showHighlightStepIndicator: false,
    fontSize: 16,
    lineHeight: 1.5,
    editorFontSize: 14,
    useGlobalTransition: true,
    globalTransitionDuration: 700,
    useGlobalStagger: true,
    globalStagger: 3,
    useGlobalHighlight: true,
    globalDimAmount: 80,
    globalSizeUpAmount: 105,
    highlightDimColor: "theme",
    currentSlideId: null,
    language: DEFAULT_LANGUAGE,
    codeAlign: "left",
    ...overrides,
  };
}

/** Parse a settings JSON blob; missing keys fall back to defaults (serde-style). */
export function parseSettings(raw: string): ProjectSettings {
  if (!raw?.trim()) return defaultSettings();
  try {
    return defaultSettings(JSON.parse(raw) as Partial<ProjectSettings>);
  } catch {
    return defaultSettings();
  }
}

/** Merge a partial patch over existing settings (theme excluded — it's a column). */
export function mergeSettings(
  existing: ProjectSettings,
  patch: Record<string, unknown>,
): ProjectSettings {
  const next: Record<string, unknown> = { ...(existing as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "theme") continue;
    next[key] = value;
  }
  return defaultSettings(next as Partial<ProjectSettings>);
}

export const HIGHLIGHT_DEFAULTS: HighlightStyle = {
  dimAmount: 75,
  sizeUpEnabled: true,
  sizeUpAmount: 125,
  useCustomTransition: false,
  dimTransition: 500,
  sizeUpTransition: 600,
};

export interface SupportedLanguageOption {
  value: string;
  label: string;
}

export interface SupportedThemeOption {
  value: string;
  label: string;
  background: string;
  light: boolean;
}

export const SUPPORTED_LANGUAGES: SupportedLanguageOption[] = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "tsx", label: "React (TSX)" },
  { value: "jsx", label: "React (JSX)" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "groovy", label: "Groovy" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash/Shell" },
  { value: "powershell", label: "PowerShell" },
  { value: "markdown", label: "Markdown" },
  { value: "merustmar", label: "Merustmar" },
];

export const SUPPORTED_THEMES: SupportedThemeOption[] = [
  { value: "dark-plus", label: "Dark+", background: "#1e1e1e", light: false },
  { value: "dracula", label: "Dracula", background: "#282a36", light: false },
  { value: "github-dark", label: "GitHub Dark", background: "#24292e", light: false },
  { value: "github-light", label: "GitHub Light", background: "#ffffff", light: true },
  { value: "nord", label: "Nord", background: "#2e3440", light: false },
  { value: "poimandres", label: "Poimandres", background: "#1b1e28", light: false },
  { value: "min-dark", label: "Min Dark", background: "#1f1f1f", light: false },
  { value: "min-light", label: "Min Light", background: "#ffffff", light: true },
  { value: "monokai", label: "Monokai", background: "#272822", light: false },
  { value: "solarized-dark", label: "Solarized Dark", background: "#002b36", light: false },
  { value: "solarized-light", label: "Solarized Light", background: "#fdf6e3", light: true },
  { value: "andromeeda", label: "Andromeeda", background: "#23262e", light: false },
  { value: "aurora-x", label: "Aurora X", background: "#07090f", light: false },
  { value: "catppuccin-latte", label: "Catppuccin Latte", background: "#eff1f5", light: true },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha", background: "#1e1e2e", light: false },
  { value: "night-owl", label: "Night Owl", background: "#011627", light: false },
];

export function isSupportedLang(input: unknown): input is string {
  return typeof input === "string" && SUPPORTED_LANGUAGES.some((l) => l.value === input);
}

export function isSupportedTheme(input: unknown): input is string {
  return typeof input === "string" && SUPPORTED_THEMES.some((t) => t.value === input);
}

/** Import data from older/unknown files safely falls back to the default. */
export function normalizeLanguage(input: string | null | undefined): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed || trimmed === "dynamic" || !isSupportedLang(trimmed)) {
    return DEFAULT_LANGUAGE;
  }
  return trimmed;
}

export function normalizeCodeAlign(input: string | undefined): string {
  return input === "center" ? "center" : "left";
}

export function defaultSlideName(orderIndex: number): string {
  return `Slide ${orderIndex + 1}`;
}

export function nowMs(): number {
  return Date.now();
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .split("")
    .map((c) => (/[A-Za-z0-9-_ ]/.test(c) ? c : "_"))
    .join("");
  const trimmed = cleaned.trim();
  const stem = trimmed || "devslides-export";
  return stem.replace(/ /g, "-").slice(0, 80);
}