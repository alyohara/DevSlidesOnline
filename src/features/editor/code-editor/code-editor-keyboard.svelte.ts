/**
 * Code-editor keyboard handling: undo/redo history, find-bar escape, and the
 * smart Tab handler. The global Cmd/Ctrl+F → centered-finder shortcut is
 * owned by the window-level handler in editor/keyboard.svelte.ts.
 */
import { isModKey } from "$lib/lib/keyboard";
import { createEditorHistory } from "@/features/editor/editor-history.svelte";
import { createTabKeyHandler } from "@/features/editor/tab-key";
import type { createCaretSync } from "@/features/editor/caret.svelte";

type CaretSyncLike = ReturnType<typeof createCaretSync>;

export function createCodeEditorKeyboard(args: {
  slideId: () => string | undefined;
  textareaEl: () => HTMLTextAreaElement | null;
  handleChange: (value: string) => void;
  saveCaret: CaretSyncLike;
  isFindOpen: () => boolean;
  closeFind: () => void;
}) {
  const { exec } = createEditorHistory({
    slideId: args.slideId,
    textarea: args.textareaEl,
    handleChange: args.handleChange,
    saveCaret: args.saveCaret,
  });

  const handleTabKey = createTabKeyHandler({
    slideId: args.slideId,
    handleChange: args.handleChange,
  });

  function handleKeyDown(
    e: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
  ) {
    const isMod = isModKey(e);
    const key = e.key.toLowerCase();
    if (isMod && (key === "z" || key === "y")) {
      e.preventDefault();
      const direction =
        key === "y" || (key === "z" && e.shiftKey) ? "redo" : "undo";
      exec(direction);
      return;
    }
    if (e.key === "Escape" && args.isFindOpen()) {
      e.preventDefault();
      args.closeFind();
      return;
    }
    if (e.key !== "Tab" || !args.slideId()) return;
    handleTabKey(e);
  }

  return { handleKeyDown };
}
