/**
 * Viewport clamping for floating menus: place a measured rect near a pointer
 * point, keeping it fully inside the window. Menus open ABOVE the point and
 * flip below when there is no room.
 */

/** Clamp a rect's top-left corner so the whole rect stays inside the window. */
export function clampRectToViewport(
  left: number,
  top: number,
  width: number,
  height: number,
  edge = 8,
): { left: number; top: number } {
  return {
    left: Math.max(edge, Math.min(left, window.innerWidth - width - edge)),
    top: Math.max(edge, Math.min(top, window.innerHeight - height - edge)),
  };
}

interface ClampMenuPositionOptions {
  /** Pointer point (client coordinates). */
  x: number;
  y: number;
  /** Measured menu size. */
  width: number;
  height: number;
  /** Offset from the pointer. */
  gap?: number;
  /** Minimum distance to every viewport edge. */
  edge?: number;
}

export function clampMenuPosition({
  x,
  y,
  width,
  height,
  gap = 8,
  edge = 8,
}: ClampMenuPositionOptions): { x: number; y: number } {
  let top = y - height - gap;
  if (top < edge) {
    // No room above the pointer — flip to below it.
    top = Math.min(window.innerHeight - height - edge, y + gap);
  }
  const { left, top: clampedTop } = clampRectToViewport(
    x + gap,
    top,
    width,
    height,
    edge,
  );
  return { x: left, y: clampedTop };
}
