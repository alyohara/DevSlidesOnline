/**
 * image-editor — shared slide image editing controller.
 *
 * Used by the preview (drag/resize layers) and by the image panel that lives
 * in the code column. Writes go through the local images shadow store and a
 * debounced save, so both callers stay in sync.
 */
import { createImageSave } from "./save-images.svelte";
import { effectiveSlideImages, setLocalImages } from "$lib/stores/slide-images.svelte";
import type { Slide, SlideImage } from "$lib/types";

export function createImageEditor(args: {
  projectId: string;
  activeSlide: () => Slide | undefined;
}) {
  const slideImages = $derived(effectiveSlideImages(args.activeSlide()));

  const imageSave = createImageSave({
    projectId: args.projectId,
    slideId: () => args.activeSlide()?.id,
  });

  function replaceImages(next: SlideImage[]) {
    const slide = args.activeSlide();
    if (!slide) return;
    setLocalImages(slide.id, next);
    imageSave.schedule(slide.id, next);
  }

  function patchImage(id: string, patch: Partial<SlideImage>) {
    replaceImages(
      slideImages.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  }

  function addImage(img: SlideImage) {
    replaceImages([...slideImages, img]);
  }

  function removeImage(id: string) {
    replaceImages(slideImages.filter((i) => i.id !== id));
  }

  return { slideImages, patchImage, addImage, removeImage };
}

export type { SlideImage };