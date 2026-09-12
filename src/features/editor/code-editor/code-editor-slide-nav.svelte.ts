/**
 * Prev/next slide navigation from the editor header: stash the caret, flush
 * the pending save, then move the selection.
 */
import { setCurrentSlideId } from "$lib/stores/ui-state.svelte";
import type { Slide } from "$lib/types";
import type { createCodeSave } from "../save.svelte";
import type { createCaretSync } from "../caret.svelte";

export function createCodeEditorSlideNav(args: {
  slides: () => Slide[];
  currentIndex: () => number;
  saveCaret: ReturnType<typeof createCaretSync>;
  save: Pick<ReturnType<typeof createCodeSave>, "flush">;
}) {
  function goSlide(dir: -1 | 1) {
    // Stash the caret for the current slide before the selection moves —
    // saveCaret also refreshes the undo snapshot, which the inline stash
    // previously skipped.
    args.saveCaret();
    args.save.flush();
    const next = args.slides()[args.currentIndex() + dir];
    if (next) setCurrentSlideId(next.id);
  }

  return { goSlide };
}
