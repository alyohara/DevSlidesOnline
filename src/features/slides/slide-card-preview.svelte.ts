import { clampRectToViewport } from "$lib/lib/menu-position";

interface UseSlideCardHoverPreviewArgs {
  isOverlay: boolean;
  enableHoverPreview: () => boolean;
  cardRoot: () => HTMLDivElement | null;
}

export function createSlideCardHoverPreview(
  args: UseSlideCardHoverPreviewArgs,
) {
  let showHoverPreview = $state(false);
  let hoverPosition = $state({ left: 8, top: 8 });
  let hoverTimer: number | null = null;

  $effect(() => () => {
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
  });

  function onMouseEnter() {
    if (args.isOverlay || !args.enableHoverPreview()) return;
    hoverTimer = window.setTimeout(() => {
      const rect = args.cardRoot()?.getBoundingClientRect();
      if (!rect) return;
      const width = 300;
      const height = 170;
      // Prefer the preview above the card, flipping below when there is no
      // room; keep the whole rect inside the viewport either way.
      const above = rect.top - height - 8;
      const top = above >= 8 ? above : rect.bottom + 8;
      hoverPosition = clampRectToViewport(rect.left, top, width, height, 8);
      showHoverPreview = true;
    }, 300);
  }

  function onMouseLeave() {
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = null;
    showHoverPreview = false;
  }

  return {
    get showHoverPreview() {
      return showHoverPreview;
    },
    get hoverPosition() {
      return hoverPosition;
    },
    onMouseEnter,
    onMouseLeave,
  };
}
