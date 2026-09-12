<script lang="ts">
  import { Trash2 } from "@lucide/svelte";
  import type { SlideImage } from "$lib/types";
  import { imageEditorState, selectImage } from "./image-editor-state.svelte";

  /**
   * Renders the slide's image layers above the code stage.
   * - background images: fixed to the stage area, behind the code (z-0)
   * - element images: freely positioned/resized layers, grouped in a wrapper
   *   at z-20 (above the code block) and stacked via their own zIndex.
   * In editable mode layers accept pointer drag (move) and a corner resize
   * handle; the pixel->percent math uses the stage's live bounding rect so
   * it stays correct at any preview scale.
   */
  let {
    images,
    stageRef,
    editable = false,
    onPatch,
    onRemove,
  }: {
    images: SlideImage[];
    stageRef: () => HTMLElement | null;
    editable?: boolean;
    onPatch?: (id: string, patch: Partial<SlideImage>) => void;
    onRemove?: (id: string) => void;
  } = $props();

  const backgrounds = $derived(images.filter((i) => i.role === "background"));
  const elements = $derived(
    [...images.filter((i) => i.role === "element")].sort(
      (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
    ),
  );

  const selectedId = $derived(
    editable ? imageEditorState.selectedImageId : null,
  );

  function clampPct(v: number) {
    return Math.max(0, Math.min(100, v));
  }

  function beginMove(e: PointerEvent, img: SlideImage) {
    if (!editable) return;
    const rect = stageRef()?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    selectImage(img.id);
    const start = { x: img.x, y: img.y, px: e.clientX, py: e.clientY };
    const onMove = (ev: PointerEvent) => {
      if (!rect.width || !rect.height) return;
      const nx = clampPct(
        start.x + ((ev.clientX - start.px) / rect.width) * 100,
      );
      const ny = clampPct(
        start.y + ((ev.clientY - start.py) / rect.height) * 100,
      );
      onPatch?.(img.id, { x: +nx.toFixed(2), y: +ny.toFixed(2) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function beginResize(e: PointerEvent, img: SlideImage) {
    if (!editable) return;
    const rect = stageRef()?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    const startW = img.width ?? 50;
    const startH = img.height ?? startW;
    const ratio = startW > 0 ? startH / startW : 1;
    const hasFixedHeight = img.height != null;
    const startPx = e.clientX;
    const onMove = (ev: PointerEvent) => {
      if (!rect.width) return;
      const delta = ((ev.clientX - startPx) / rect.width) * 100;
      const w = clampPct(Math.max(5, startW + delta));
      const patch: Partial<SlideImage> = { width: +w.toFixed(2) };
      if (hasFixedHeight) patch.height = +(w * ratio).toFixed(2);
      onPatch?.(img.id, patch);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
</script>

{#each backgrounds as img (img.id)}
  <img
    src={img.src}
    alt=""
    draggable={false}
    class="pointer-events-none absolute inset-0 h-full w-full object-cover"
    style:z-index="0"
    style:opacity={img.opacity / 100}
  />
{/each}

<div class="absolute inset-0 z-20" class:pointer-events-none={!editable}>
  {#each elements as img (img.id)}
    <div
      class="absolute"
      class:pointer-events-none={!editable}
      style:z-index={img.zIndex}
      style:left={`${clampPct(img.x)}%`}
      style:top={`${clampPct(img.y)}%`}
      style:width={img.width != null ? `${img.width}%` : "auto"}
      style:height={img.height != null ? `${img.height}%` : "auto"}
      style:opacity={img.opacity / 100}
    >
      <img
        src={img.src}
        alt=""
        draggable={false}
        class="pointer-events-none block max-w-none"
        style:width="100%"
        style:height="100%"
        style:object-fit="contain"
      />

      {#if editable}
        <div
          role="button"
          tabindex="-1"
          aria-label="Move image layer"
          class="absolute inset-0 cursor-move"
          style:touch-action="none"
          onpointerdown={(e) => beginMove(e, img)}
        ></div>
        <div
          class="pointer-events-none absolute -inset-1 rounded border-2 border-dashed border-sky-400/70"
          class:hidden={selectedId !== img.id}
          aria-hidden="true"
        ></div>
        {#if selectedId === img.id}
          <button
            type="button"
            class="absolute -top-2.5 -right-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
            style:touch-action="none"
            aria-label="Remove image"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove?.(img.id);
            }}
          >
            <Trash2 class="h-3 w-3" />
          </button>
          <div
            class="absolute -right-1 -bottom-1 z-10 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-sky-400 bg-background shadow"
            style:touch-action="none"
            aria-hidden="true"
            onpointerdown={(e) => beginResize(e, img)}
          ></div>
        {/if}
      {/if}
    </div>
  {/each}
</div>
