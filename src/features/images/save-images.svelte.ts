/**
 * Debounced slide image-layer save (500ms) with flush on slide switch /
 * editor unmount — mirrors features/editor/save.svelte.ts.
 *
 * Image edits are intentionally quiet (no save-status indicator, no undo
 * toast): drag/resize produces many cheap commits and a per-frame toast
 * would be noise.
 */
import { updateSlideImagesMutation } from "$lib/queries";
import { clearLocalImages } from "$lib/stores/slide-images.svelte";
import type { SlideImage } from "$lib/types";

export function createImageSave(args: {
  projectId: string;
  slideId: () => string | undefined;
}) {
  const SAVE_DEBOUNCE_MS = 500;
  const imageMutation = updateSlideImagesMutation(args.projectId);

  let saveTimer: number | undefined;
  let pendingSave: { id: string; images: SlideImage[] } | null = null;

  function runSave(id: string, images: SlideImage[]) {
    imageMutation.mutate({ slideId: id, images });
  }

  function schedule(id: string, images: SlideImage[]) {
    pendingSave = { id, images };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const p = pendingSave;
      pendingSave = null;
      saveTimer = undefined;
      if (p) runSave(p.id, p.images);
    }, SAVE_DEBOUNCE_MS);
  }

  /** Run the pending edit immediately, if any. */
  function flush() {
    if (saveTimer !== undefined && pendingSave) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
      const { id, images } = pendingSave;
      pendingSave = null;
      runSave(id, images);
    }
  }

  $effect(() => {
    void args.slideId();
    return () => {
      // A slide switch or panel unmount must persist the final debounced
      // edit before disposing its timer. Only clear the shadow for the id
      // we actually flushed — after a slide switch the prop already points
      // at the next slide.
      const id = pendingSave?.id;
      flush();
      if (id) clearLocalImages(id);
    };
  });

  return { schedule, flush };
}
