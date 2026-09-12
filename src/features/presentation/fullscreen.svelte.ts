/**
 * createPresentFullscreen — encapsulates fullscreen enter/exit + OS sync.
 *
 * Browser build: fullscreen is the standard Fullscreen API only (there is no
 * native window to flip into fullscreen mode).
 */
import {
  ui,
  setIsAutoPlaying,
  setIsPresenting,
} from "$lib/stores/ui-state.svelte";

export function createPresentFullscreen() {
  async function exitPresent() {
    setIsPresenting(false);
    setIsAutoPlaying(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  }

  async function tryEnterFullscreen() {
    const el = document.getElementById("devslides-present-root");
    try {
      if (el && el.requestFullscreen && !document.fullscreenElement) {
        await el.requestFullscreen();
      }
    } catch {
      /* overlay still works windowed */
    }
  }

  function enterPresent() {
    setIsPresenting(true);
  }

  // When overlay mounts, request true fullscreen after a tick
  $effect(() => {
    if (!ui.isPresenting) return;
    const t = window.setTimeout(() => {
      void tryEnterFullscreen();
    }, 50);
    return () => window.clearTimeout(t);
  });

  // If the user exits browser fullscreen via Esc or a browser UI control,
  // sync presentation state back to the UI.
  $effect(() => {
    if (!ui.isPresenting) return;

    const syncFullscreenState = () => {
      const el = document.getElementById("devslides-present-root");
      if (!el || document.fullscreenElement) return;
      setIsPresenting(false);
      setIsAutoPlaying(false);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    const interval = window.setInterval(syncFullscreenState, 750);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      window.clearInterval(interval);
    };
  });

  return { enterPresent, exitPresent };
}