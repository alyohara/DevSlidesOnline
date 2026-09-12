<script lang="ts">
  /**
   * In-app toolbar strip, drawn under macOS's native traffic lights.
   *
   * On macOS the window uses `titleBarStyle: "Overlay"` + `hiddenTitle`, so the
   * webview paints underneath the native window controls. This bar doubles as
   * the window's custom drag region (`data-tauri-drag-region`) so it stays
   * movable — unlike a classic title bar it is always visible (never hidden on
   * hover), while its interactive children (buttons, inputs) remain clickable.
   *
   * The leading group reserves a `trafficGutter` (default 88px) left gutter
   * on macOS so our icons never overlap the traffic bubbles; on Windows/Linux
   * native decorations remain and no gutter is added.
   */
  import type { Snippet } from "svelte";
  import { cn } from "$lib/lib/utils";
  import { isMacOS } from "$lib/lib/platform";

  /** Clears the macOS traffic lights (x:20 + ~54px) plus a real gap. */
  const TRAFFIC_LIGHTS_GUTTER_PX = 88;

  let {
    title,
    class: className,
    leading,
    trailing,
    borderless,
    /** Reserved left gutter (px) for the macOS traffic lights. 0 = none. */
    trafficGutter,
  }: {
    title?: string;
    class?: string;
    leading?: Snippet;
    trailing?: Snippet;
    /** When true, omit the bottom border (merged into a single bar). */
    borderless?: boolean;
    /** Override the default 88px macOS traffic-gutter padding. */
    trafficGutter?: number;
  } = $props();

  const gutterPx = $derived(
    trafficGutter ?? (isMacOS() ? TRAFFIC_LIGHTS_GUTTER_PX : 0),
  );
</script>

<div
  data-tauri-drag-region
  class={cn(
    "flex h-11 shrink-0 items-center justify-between gap-3 bg-card/70 backdrop-blur-md",
    !borderless && "border-b border-border/60",
    className,
  )}
>
  <div
    data-tauri-drag-region="true"
    class="flex min-w-0 flex-1 items-center gap-2"
    style:padding-left={gutterPx > 0 ? `${gutterPx}px` : "0.75rem"}
  >
    {@render leading?.()}
    {#if title}
      <span class="truncate text-sm font-medium text-foreground/90"
        >{title}</span
      >
    {/if}
  </div>
  <div
    data-tauri-drag-region="true"
    class="flex shrink-0 items-center gap-1"
    style:padding-right="0.75rem"
  >
    {@render trailing?.()}
  </div>
</div>
