/**
 * PDF export: renders every slide exactly like the presenting stage, shared
 * Shiki highlighter included, and assembles a 16:9 PDF deck.
 *
 * The pipeline is intentionally DOM-based and uses the app's own building
 * blocks (requestHtml → Shiki worker, themeBackground / fallbackForeground,
 * the SlideImage layout model) so the exported artifact matches what the
 * presenter sees. Each page is rasterized to PNG via html-to-image and packed
 * into a JS PDF, then handed to the backend for a native save dialog
 * (base64 keeps the bytes small over the JSON IPC bridge).
 */
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import { requestHtml } from "$lib/shiki/shiki-worker-client";
import {
  fallbackForeground,
  resolveProjectLanguage,
  themeBackground,
  type Project,
  type Slide,
  type SlideImage,
} from "$lib/types";
import { api } from "$lib/lib/tauri-api";

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;
/** Presenting-stage padding (md:p-24) — 96px on desktop windows. */
const STAGE_PAD = 96;
const MONO_FONT =
  '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Highlight one slide through the shared worker; null → plain-text fallback. */
async function highlightSlide(
  project: Project,
  slide: Slide,
): Promise<string | null> {
  if (!slide.code.trim()) return null;
  try {
    const response = await requestHtml(
      slide.code,
      resolveProjectLanguage(project),
      project.theme,
    );
    return response.html || null;
  } catch {
    return null;
  }
}

function buildCodeBlock(
  codeHtml: string | null,
  rawCode: string,
  project: Project,
  fontSize: number,
  lineHeight: number,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:100%;";
  const pre = document.createElement("pre");
  pre.style.cssText = [
    "margin:0",
    "padding:0",
    "background-color:transparent",
    "border:0",
    "display:block",
    "white-space:pre",
    "text-align:left",
    `color:${fallbackForeground(project.theme)}`,
    `font-family:${MONO_FONT}`,
    "font-weight:500",
    "letter-spacing:0.025em",
    `font-size:${fontSize}px`,
    `line-height:${lineHeight}`,
  ].join(";");
  if (codeHtml) {
    // Shiki's inner <code> contents (line <span>s with per-token inline colors).
    pre.innerHTML = codeHtml;
  } else {
    pre.innerHTML = escapeHtml(rawCode);
  }
  wrap.appendChild(pre);
  return wrap;
}

function addBackground(stage: HTMLElement, img: SlideImage): void {
  const el = document.createElement("img");
  el.src = img.src;
  el.alt = "";
  el.style.cssText = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "object-fit:cover",
    "z-index:0",
    `opacity:${img.opacity / 100}`,
  ].join(";");
  stage.appendChild(el);
}

function addElement(layer: HTMLElement, img: SlideImage): void {
  const box = document.createElement("div");
  box.style.cssText = [
    "position:absolute",
    `left:${clampPct(img.x)}%`,
    `top:${clampPct(img.y)}%`,
    img.width != null ? `width:${img.width}%` : "width:auto",
    img.height != null ? `height:${img.height}%` : "height:auto",
    `z-index:${img.zIndex ?? 0}`,
    `opacity:${img.opacity / 100}`,
  ].join(";");
  const el = document.createElement("img");
  el.src = img.src;
  el.alt = "";
  el.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
  box.appendChild(el);
  layer.appendChild(box);
}

/** Reproduction of the presenting stage, using only inline styles so the
 *  rasterizer keeps colors exactly as authored (no Tailwind var() lookups). */
function buildSlideNode(
  project: Project,
  slide: Slide,
  codeHtml: string | null,
): HTMLElement {
  const settings = project.settings;
  const bg = settings.useBlackCodeBackground
    ? "#000000"
    : themeBackground(project.theme);
  const center = settings.codeAlign === "center";
  // Same scale factor as the presenting stage (SlidePreview's * 1.15).
  const fontSize = settings.fontSize * 1.15;
  const lineHeight = settings.lineHeight;

  const stage = document.createElement("div");
  stage.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    `width:${SLIDE_WIDTH}px`,
    `height:${SLIDE_HEIGHT}px`,
    "overflow:hidden",
    `background:${bg}`,
  ].join(";");

  for (const img of slide.images) {
    if (img.role === "background") addBackground(stage, img);
  }

  // Code block: z-10, vertically centered like the app's stage.
  const content = document.createElement("div");
  content.style.cssText = [
    "position:absolute",
    "inset:0",
    "z-index:10",
    "display:flex",
    "align-items:center",
    center ? "justify-content:center" : "justify-content:flex-start",
    `padding:${STAGE_PAD}px`,
  ].join(";");
  content.appendChild(
    buildCodeBlock(codeHtml, slide.code, project, fontSize, lineHeight),
  );
  stage.appendChild(content);

  // Element layers above the code (z-20), lowest zIndex first like the app.
  const elements = slide.images
    .filter((img) => img.role === "element")
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  if (elements.length > 0) {
    const layer = document.createElement("div");
    layer.style.cssText =
      "position:absolute;inset:0;z-index:20;pointer-events:none;";
    for (const img of elements) addElement(layer, img);
    stage.appendChild(layer);
  }

  return stage;
}

async function ensureImagesReady(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(images.map((img) => img.decode().catch(() => {})));
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Load a project by id, then render + persist it as a PDF. */
export async function exportProjectToPdfById(
  projectId: string,
): Promise<string> {
  const project = await api.getProject(projectId);
  return exportProjectToPdf(project);
}

/** Render the whole project to a PDF and persist it via a native save dialog. */
export async function exportProjectToPdf(project: Project): Promise<string> {
  const { slides } = project;
  if (slides.length === 0) {
    throw new Error("This presentation has no slides to export");
  }

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [SLIDE_WIDTH, SLIDE_HEIGHT],
    compress: true,
  });

  // Off-screen host so the pages mount in a real, laid-out document.
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;`;
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    let first = true;
    for (const slide of slides) {
      const codeHtml = await highlightSlide(project, slide);
      const node = buildSlideNode(project, slide, codeHtml);
      host.appendChild(node);
      try {
        await ensureImagesReady(node);
        await nextFrame();
        const dataUrl = await toPng(node, {
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          pixelRatio: 1,
          cacheBust: true,
        });
        if (first) {
          first = false;
        } else {
          pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], "landscape");
        }
        pdf.addImage(dataUrl, "PNG", 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
      } finally {
        node.remove();
      }
    }
  } finally {
    host.remove();
  }

  const buffer = pdf.output("arraybuffer") as ArrayBuffer;
  return api.exportPdf(uint8ToBase64(new Uint8Array(buffer)), project.name);
}
