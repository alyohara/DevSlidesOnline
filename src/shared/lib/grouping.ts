type ChunkKind = "single" | "stack";

export interface GroupChunk<T> {
  kind: ChunkKind;
  groupId?: string;
  items: T[];
}

/**
 * Groups consecutive items with the same non-empty group/section ID into chunks.
 * Single items or stacks with only 1 item are returned with `kind: "single"`.
 */
/**
 * Stable identity of a chunk: the group id when it is a real stack (2+
 * items), otherwise the single item's id. Consumers (dnd decisions, cell
 * rendering, expansion tracking) must agree on this to hit the same target.
 */
export function chunkIdOf<T extends { id: string }>(
  chunk: GroupChunk<T>,
): string {
  return chunk.kind === "stack" && chunk.items.length > 1
    ? chunk.groupId!
    : chunk.items[0]!.id;
}

export function chunkConsecutive<T>(
  items: T[],
  getGroupId?: (item: T) => string | null | undefined,
): GroupChunk<T>[] {
  const result: GroupChunk<T>[] = [];
  if (!items || !Array.isArray(items) || items.length === 0) return result;

  const keyFn =
    getGroupId ||
    ((item: T & { groupId?: string | null; sectionId?: string | null }) =>
      item?.groupId ?? item?.sectionId ?? null);

  let currentChunk: GroupChunk<T> | null = null;

  for (const item of items) {
    if (item === null || item === undefined) continue;
    const rawId = keyFn(item);
    const validGroupId =
      rawId && typeof rawId === "string" && rawId.trim().length > 0
        ? rawId.trim()
        : null;

    if (validGroupId) {
      if (currentChunk && currentChunk.groupId === validGroupId) {
        currentChunk.items.push(item);
      } else {
        if (currentChunk) result.push(currentChunk);
        currentChunk = {
          kind: "stack",
          groupId: validGroupId,
          items: [item],
        };
      }
    } else {
      if (currentChunk) result.push(currentChunk);
      currentChunk = {
        kind: "single",
        items: [item],
      };
    }
  }

  if (currentChunk) {
    result.push(currentChunk);
  }

  return result.map((chunk) => {
    if (chunk.items.length <= 1) {
      return {
        ...chunk,
        kind: "single",
      };
    }
    return chunk;
  });
}
