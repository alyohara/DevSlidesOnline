/**
 * Native app-menu handler map for the editor route. Pure wiring — handlers
 * read fresh state from `ui` at fire time, so the map can be created once.
 */
import { push } from "svelte-spa-router";
import {
  ui,
  setIsSettingsOpen,
  setIsCommandOpen,
  setIsShortcutsOpen,
  setIsAboutOpen,
  toggleZenMode,
  toggleTheme,
} from "$lib/stores/ui-state.svelte";
import type { AppMenuHandlers } from "$lib/lib/app-menu.svelte";
import { emitUndo, emitRedo } from "$lib/lib/app-events";
import { api } from "$lib/lib/tauri-api";
import { APP_ISSUES_URL, APP_REPOSITORY_URL } from "$lib/lib/app-info";
import { checkForUpdatesFromMenu } from "$lib/updates/update-check";

export function createEditorMenuHandlers(args: {
  projectId: () => string | undefined;
  createProject: (name: string) => Promise<{ id: string }>;
  exportProject: (id: string) => void;
  exportPdf: (id: string) => void;
  enterPresent: () => void;
  addSlide: () => Promise<unknown> | void;
  duplicateSlide: (id: string) => void;
}): AppMenuHandlers {
  const {
    projectId,
    createProject,
    exportProject,
    exportPdf,
    enterPresent,
    addSlide,
    duplicateSlide,
  } = args;
  return {
    "menu://new-project": () => {
      void createProject("Untitled Presentation").then((p) => {
        void push(`/editor/${p.id}`);
      });
    },
    "menu://open-dashboard": () => void push("/"),
    "menu://export": () => {
      const pid = projectId();
      if (pid) exportProject(pid);
    },
    "menu://export-pdf": () => {
      const pid = projectId();
      if (pid) exportPdf(pid);
    },
    "menu://present": () => enterPresent(),
    "menu://zen": () => toggleZenMode(),
    "menu://settings": () => setIsSettingsOpen(true),
    "menu://command-palette": () => setIsCommandOpen(true),
    "menu://add-slide": () => {
      if (projectId()) void addSlide();
    },
    "menu://duplicate-slide": () => {
      const pid = projectId();
      if (pid && ui.currentSlideId) duplicateSlide(ui.currentSlideId);
    },
    "menu://toggle-theme": () => toggleTheme(),
    "menu://shortcuts-app": () => setIsShortcutsOpen(true),
    "menu://shortcuts-help": () => setIsShortcutsOpen(true),
    "menu://help-docs": () =>
      void api.openUrl(APP_REPOSITORY_URL).catch(() => {}),
    "menu://report-issue": () =>
      void api.openUrl(APP_ISSUES_URL).catch(() => {}),
    "menu://about": () => setIsAboutOpen(true),
    "menu://check-updates": () => void checkForUpdatesFromMenu(),
    "menu://undo": () => emitUndo(),
    "menu://redo": () => emitRedo(),
  };
}
