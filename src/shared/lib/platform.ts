/** Lightweight platform helpers (no extra plugin required). */

type AppPlatform = "macos" | "windows" | "unknown";

function detectPlatform(): AppPlatform {
  const ua = navigator.userAgent.toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();

  if (plat.includes("mac") || ua.includes("mac os")) return "macos";
  if (plat.includes("win") || ua.includes("windows")) return "windows";
  return "unknown";
}

function isMacOS(): boolean {
  return detectPlatform() === "macos";
}

/** Modifier label for UI hints. */
export function modKeyLabel(): string {
  return isMacOS() ? "⌘" : "Ctrl";
}
