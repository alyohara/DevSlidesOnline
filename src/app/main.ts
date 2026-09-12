import { mount } from "svelte";
import App from "./App.svelte";
import { flushPendingSave } from "$lib/lib/code-save";
import { initInitialTheme } from "$lib/stores/ui-persistence";
import { initBackendConfig } from "$lib/lib/backend-config-loader";
import { initSession } from "$lib/lib/session.svelte";
import "../index.css";

// Hydrate the persisted theme before first paint (ui-persistence owns the
// localStorage wire format).
initInitialTheme();
// Prevent Grammarly/LanguageTool/Microsoft Editor from intercepting the document;
// the editor textarea carries the actual spellcheck/autocorrect controls.
document.documentElement.setAttribute("data-gramm", "false");
document.documentElement.setAttribute("data-gramm_editor", "false");
document.documentElement.setAttribute("data-enable-grammarly", "false");

// Backend-owned capabilities/defaults bootstrap once per app session.
void initBackendConfig();
// Restore the session from the session cookie (if any) before first paint.
void initSession();

// Belt-and-braces for the browser/dev context: fire the pending debounced
// code save on unload too (the request goes out immediately; it usually
// lands in ms).
window.addEventListener("beforeunload", () => {
  void flushPendingSave();
});

const app = mount(App, {
  target: document.getElementById("app") as HTMLElement,
});

export default app;
