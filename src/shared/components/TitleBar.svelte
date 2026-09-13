<script lang="ts">
  /**
   * In-app toolbar strip (browser).
   *
   * DevSlidesOnline runs without native window chrome, so there is no custom
   * drag region and no macOS traffic-light gutter — the bar simply reserves a
   * small leading/trailing padding around its children.
   */
  import type { Snippet } from "svelte";
  import { cn } from "$lib/lib/utils";

  let {
    title,
    class: className,
    leading,
    trailing,
    borderless,
  }: {
    title?: string;
    class?: string;
    leading?: Snippet;
    trailing?: Snippet;
    /** When true, omit the bottom border (merged into a single bar). */
    borderless?: boolean;
  } = $props();
</script>

<div
  class={cn(
    "flex h-11 shrink-0 items-center justify-between gap-3 bg-card/70 backdrop-blur-md",
    !borderless && "border-b border-border/60",
    className,
  )}
>
  <div class="flex min-w-0 flex-1 items-center gap-2 pl-3">
    {@render leading?.()}
    {#if title}
      <span class="truncate text-sm font-medium text-foreground/90"
        >{title}</span
      >
    {/if}
  </div>
  <div class="flex shrink-0 items-center gap-1 pr-3">
    {@render trailing?.()}
  </div>
</div>
