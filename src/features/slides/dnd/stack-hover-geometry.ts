/**
 * Stack-hover geometry (pure). Fractions of a card rect:
 * ENTER = visible dashed zone; EXIT = larger "stay" region so pointer
 * jitter near the edge doesn't drop the target (hysteresis).
 */
import { pointInRect } from "$lib/lib/geometry";
import { isSelfStackTarget } from "$lib/lib/stacking";
import type { StackHoverElement } from "./dnd-types";

const STACK_ENTER_X = 0.16;
const STACK_ENTER_Y = 0.12;
const STACK_EXIT_X = 0.05;
const STACK_EXIT_Y = 0.04;

/**
 * The visible dashed stack zone (SlideStripExpanded data-stack-target
 * overlay) and the enter hit test use the same inset fractions, so the
 * visual zone always matches the detection zone.
 */
export const STACK_ZONE_INSET_X_PCT = STACK_ENTER_X * 100;
export const STACK_ZONE_INSET_Y_PCT = STACK_ENTER_Y * 100;

export function findStackHoverId(opts: {
  pointer: { x: number; y: number };
  /** Ids belonging to the dragged item (never a valid target). */
  draggingIds: Set<string>;
  /** Section of the dragged item — stacking onto a sibling is meaningless. */
  draggedSection: string | null;
  /** Currently hovered target — hysteresis gives it the larger stay region. */
  currentHoverId: string | null;
  elements: StackHoverElement[];
}): string | null {
  const { pointer, draggingIds, draggedSection, currentHoverId, elements } =
    opts;
  for (const el of elements) {
    if (
      isSelfStackTarget({
        targetId: el.id,
        targetStackKey: el.section,
        draggingIds,
        draggedStackKey: draggedSection,
      })
    ) {
      continue;
    }
    const insetX = currentHoverId === el.id ? STACK_EXIT_X : STACK_ENTER_X;
    const insetY = currentHoverId === el.id ? STACK_EXIT_Y : STACK_ENTER_Y;
    if (pointInRect(pointer.x, pointer.y, el.rect, insetX, insetY)) {
      return el.id;
    }
  }
  return null;
}
