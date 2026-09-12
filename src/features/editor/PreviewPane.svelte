<script lang="ts">
  import SlidePreview from "@/features/preview/SlidePreview.svelte";
  import RenderBoundary from "$lib/components/RenderBoundary.svelte";
  import HighlightStepIndicator from "@/features/highlights/HighlightStepIndicator.svelte";
  import SlideImagesPanel from "@/features/images/SlideImagesPanel.svelte";
  import { createImageSave } from "@/features/images/save-images.svelte";
  import { untrack } from "svelte";
  import { imageEditorState } from "@/features/images/image-editor-state.svelte";
  import {
    effectiveSlideImages,
    setLocalImages,
  } from "$lib/stores/slide-images.svelte";
  import type { Project, Slide, SlideImage } from "$lib/types";

  let {
    project,
    activeSlide,
    effectiveHighlight,
    onHighlightExitComplete,
    onSelectHighlight,
  }: {
    project: Project;
    activeSlide?: Slide;
    effectiveHighlight: number;
    onHighlightExitComplete: () => void;
    onSelectHighlight: (index: number) => boolean;
  } = $props();

  const slideImages = $derived(effectiveSlideImages(activeSlide));

  const imageSave = createImageSave({
    projectId: untrack(() => project.id),
    slideId: () => activeSlide?.id,
  });

  function replaceImages(next: SlideImage[]) {
    if (!activeSlide) return;
    setLocalImages(activeSlide.id, next);
    imageSave.schedule(activeSlide.id, next);
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
</script>

<div
  class="relative flex h-full items-center justify-center bg-muted/20 p-4 pb-5"
>
  <div class="relative aspect-video h-full max-h-full w-full max-w-full">
    {#key `preview-${project.id}`}
      <RenderBoundary>
        <SlidePreview
          {project}
          slideId={activeSlide?.id}
          activeHighlightIndex={effectiveHighlight}
          {onHighlightExitComplete}
          allowImageEditing
          onImagePatch={patchImage}
          onImageRemove={removeImage}
        />
      </RenderBoundary>
    {/key}
    {#if project.settings.showHighlightStepIndicator !== false}
      <div
        class="pointer-events-none absolute inset-x-0 bottom-2.5 z-40 flex justify-center"
      >
        <div class="pointer-events-auto">
          <HighlightStepIndicator
            compact
            total={activeSlide?.highlights?.length ?? 0}
            current={effectiveHighlight}
            onSelect={(idx) => onSelectHighlight(idx)}
          />
        </div>
      </div>
    {/if}
  </div>

  {#if imageEditorState.open}
    <div
      class="absolute top-3 right-3 z-[60] w-64 rounded-lg border bg-card/95 shadow-lg backdrop-blur"
    >
      <SlideImagesPanel
        slideId={activeSlide?.id}
        images={slideImages}
        onPatch={patchImage}
        onAdd={addImage}
        onRemove={removeImage}
      />
    </div>
  {/if}
</div>
