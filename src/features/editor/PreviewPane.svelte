<script lang="ts">
  import SlidePreview from "@/features/preview/SlidePreview.svelte";
  import RenderBoundary from "$lib/components/RenderBoundary.svelte";
  import HighlightStepIndicator from "@/features/highlights/HighlightStepIndicator.svelte";
  import { untrack } from "svelte";
  import { createImageEditor } from "@/features/images/image-editor.svelte";
  import type { Project, Slide } from "$lib/types";

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

  // Shared with the code-column image panel so drag/resize and panel edits
  // keep the same local shadow + debounced save.
  const { patchImage, removeImage } = createImageEditor({
    projectId: untrack(() => project.id),
    activeSlide: () => activeSlide,
  });
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
</div>
