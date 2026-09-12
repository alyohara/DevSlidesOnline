/**
 * Pure stacking and fan layout utilities.
 */

/** Horizontal gap between fanned cards. */
export const FAN_STEP_X = 85;
/** Vertical arc: cards further from the center dip this much per step. */
export const FAN_CURVE_Y_PER_INDEX = 12;

/**
 * Self-target guard shared by the two dnd stacks (dashboard chunk grid +
 * slide strip): a stack target that belongs to the dragged item itself —
 * the dragged ids, or anything sharing the dragged item's stack — is never
 * a valid drop target, so both implementations exclude targets with the
 * same shape. `stackKey` is the identity a drop would merge into (a chunk
 * id on the dashboard, a slide section on the strip); `null` means "not
 * part of any stack".
 */
export function isSelfStackTarget(opts: {
  targetId: string;
  targetStackKey: string | null;
  draggingIds: Iterable<string>;
  draggedStackKey: string | null;
}): boolean {
  const { targetId, targetStackKey, draggingIds, draggedStackKey } = opts;
  if (
    draggedStackKey !== null &&
    targetStackKey !== null &&
    targetStackKey === draggedStackKey
  ) {
    return true;
  }
  for (const id of draggingIds) {
    if (id === targetId) return true;
  }
  return false;
}

/**
 * Builds a Map<groupId, ids[]>, returning an array of id-lists for groups
 * that have <= 1 member (which should be auto-dissolved).
 */
export function findSingleMemberGroups<T>(
  items: T[],
  getGroupId: (i: T) => string | null | undefined,
  getId: (i: T) => string,
): string[][] {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const groupCounts = new Map<string, string[]>();
  for (const item of items) {
    if (item === null || item === undefined) continue;
    const rawId = getGroupId(item);
    if (rawId && typeof rawId === "string" && rawId.trim().length > 0) {
      const gid = rawId.trim();
      if (!groupCounts.has(gid)) groupCounts.set(gid, []);
      groupCounts.get(gid)!.push(getId(item));
    }
  }

  const result: string[][] = [];
  for (const [, ids] of groupCounts.entries()) {
    if (ids.length <= 1) {
      result.push(ids);
    }
  }
  return result;
}

/**
 * Computes rotation, horizontal offset, and vertical offset for a fanned card.
 */
export function computeFanLayout(
  total: number,
  index: number,
): { rotate: number; x: number; y: number } {
  if (total <= 0) {
    return { rotate: 0, x: 0, y: 0 };
  }
  const offset = index - (total - 1) / 2;
  return {
    rotate: offset * 9,
    x: offset * FAN_STEP_X,
    y: Math.abs(offset) * FAN_CURVE_Y_PER_INDEX - 20,
  };
}
