/**
 * slide-images — per-slide local image layer overrides (editor shadow).
 *
 * The editor mutates its own snapshot (`localImages[id]`) while moving /
 * resizing layers; the persisted `slide.images` stays untouched until the
 * debounced save commits. Reading `effectiveSlideImages(slide)` inside a
 * `$derived(...)` tracks only that slide's key.
 */
import type { SlideImage } from "$lib/types";

const localImages = $state<Record<string, SlideImage[]>>({});

interface SlideLike {
  id: string;
  images: SlideImage[];
}

/**
 * Canonical read of a slide's effective image layers — the editor's local
 * override wins over the persisted list.
 */
export function effectiveSlideImages(
  slide: SlideLike | undefined,
): SlideImage[] {
  return slide ? (localImages[slide.id] ?? slide.images ?? []) : [];
}

export function setLocalImages(id: string, images: SlideImage[]) {
  localImages[id] = images;
}

/** Current editor shadow for a slide, if any (a raw, non-reactive read). */
export function getLocalImages(id: string): SlideImage[] | undefined {
  return localImages[id];
}

export function clearLocalImages(id: string) {
  if (!(id in localImages)) return;
  delete localImages[id];
}

export function clearAllLocalImages() {
  for (const id of Object.keys(localImages)) {
    delete localImages[id];
  }
}
