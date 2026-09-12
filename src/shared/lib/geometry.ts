/**
 * Point-in-rect containment shared by the pointer-based hit tests
 * (dashboard chunk grid + slide strip stack zones).
 */

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** True when `point` falls inside `rect`, optionally inset by fractions of
 * its size (0.5 = half in from each edge). */
export function pointInRect(
  x: number,
  y: number,
  rect: RectLike,
  insetX = 0,
  insetY = 0,
): boolean {
  return (
    x >= rect.left + rect.width * insetX &&
    x <= rect.right - rect.width * insetX &&
    y >= rect.top + rect.height * insetY &&
    y <= rect.bottom - rect.height * insetY
  );
}
