/**
 * App-menu shortcut delivery for the browser.
 *
 * The desktop app received "menu://…" events from a native menu bar. In the
 * browser there is no native menu, so every chord that was menu-only on the
 * desktop is delivered through a window keydown listener — this mirrors the
 * Windows/Linux keydown fallback of the original implementation, but always
 * active regardless of platform.
 */
import type { AppMenuEvent } from "$lib/lib/app-menu";
import { SHORTCUTS } from "$lib/lib/shortcuts";
import { isModKey } from "$lib/lib/keyboard";

export type AppMenuHandlers = Partial<Record<AppMenuEvent, () => void>>;

/** Shortcuts the browser must route through keydown (no native menu to fire). */
const MENU_ONLY_EVENTS: ReadonlyArray<{
  event: AppMenuEvent;
  keys: readonly string[];
}> = [
  { event: "menu://new-project", keys: SHORTCUTS.newProject.keys },
  { event: "menu://open-dashboard", keys: SHORTCUTS.openDashboard.keys },
  { event: "menu://export", keys: SHORTCUTS.export.keys },
  { event: "menu://present", keys: SHORTCUTS.present.keys },
  { event: "menu://settings", keys: SHORTCUTS.settings.keys },
  { event: "menu://add-slide", keys: SHORTCUTS.addSlide.keys },
  { event: "menu://duplicate-slide", keys: SHORTCUTS.duplicateSlide.keys },
];

/** Does a KeyboardEvent match a SHORTCUTS key list like ["mod","Shift","N"]? */
function matchesShortcut(e: KeyboardEvent, keys: readonly string[]): boolean {
  const wantsMod = keys.includes("mod");
  const wantsShift = keys.includes("Shift");
  if (wantsMod !== isModKey(e)) return false;
  if (wantsShift !== e.shiftKey) return false;
  if (e.altKey) return false;
  const key = keys.find((k) => k !== "mod" && k !== "Shift");
  if (!key) return false;
  // Letters match case-insensitively; symbols (",") match exactly.
  return e.key.toLowerCase() === key.toLowerCase();
}

export function subscribeToAppMenu(handlers: () => AppMenuHandlers) {
  $effect(() => {
    const unsubs: Array<() => void> = [];
    // Snapshot the handler map for this subscription round — listeners read
    // through it so replacements only take effect on resubscribe.
    const current = handlers();
    const events = Object.keys(current) as AppMenuEvent[];

    const lastFired = new Map<AppMenuEvent, number>();
    const dispatch = (ev: AppMenuEvent) => {
      const now = Date.now();
      if (now - (lastFired.get(ev) ?? 0) < 200) return;
      lastFired.set(ev, now);
      current[ev]?.();
    };

    if (events.length > 0) {
      const onKeyDown = (e: KeyboardEvent) => {
        for (const { event, keys } of MENU_ONLY_EVENTS) {
          if (matchesShortcut(e, keys) && current[event]) {
            e.preventDefault();
            dispatch(event);
            return;
          }
        }
      };
      window.addEventListener("keydown", onKeyDown);
      unsubs.push(() => window.removeEventListener("keydown", onKeyDown));
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  });
}