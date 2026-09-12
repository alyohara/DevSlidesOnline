/**
 * Native application menu (macOS menu bar / Windows window menu).
 *
 * DevSlidesOnline runs fully in the browser, so there is no native menu to
 * install. The event contract is preserved for compatibility with
 * `subscribeToAppMenu` (which routes the same chords through a window keydown
 * listener); `installAppMenu` is intentionally a no-op.
 */

export type AppMenuEvent =
  | "menu://new-project"
  | "menu://open-dashboard"
  | "menu://export"
  | "menu://export-pdf"
  | "menu://present"
  | "menu://zen"
  | "menu://settings"
  | "menu://command-palette"
  | "menu://add-slide"
  | "menu://duplicate-slide"
  | "menu://toggle-theme"
  | "menu://shortcuts-app"
  | "menu://shortcuts-help"
  | "menu://help-docs"
  | "menu://report-issue"
  | "menu://about"
  | "menu://check-updates"
  | "menu://undo"
  | "menu://redo";

/** No-op in the browser — the web app has no native menu bar. */
export async function installAppMenu(): Promise<void> {
  /* native menus are a desktop-only feature */
}