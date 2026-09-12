/**
 * DOM contracts shared by the two drag implementations (dashboard chunk
 * grid + slide strip). Both hit-testing TS selectors and rendered Svelte
 * markup must agree on these attribute names, so they live here instead of
 * being duplicated as string literals.
 */

/** `data-chunk-id` — dashboard grid cell that owns a project chunk. */
export const CHUNK_ID_ATTR = "data-chunk-id";
export const CHUNK_SELECTOR = `[${CHUNK_ID_ATTR}]`;

/** `data-stack-card` — slide-strip element standing in for a stackable card. */
export const STACK_CARD_ATTR = "data-stack-card";
export const STACK_CARD_SELECTOR = `[${STACK_CARD_ATTR}]`;

/** `data-stack-section` — the stack (section) a strip card belongs to. */
export const STACK_SECTION_ATTR = "data-stack-section";

/** `data-stack-target` — pure-feedback overlay marking a card's stack zone. */
export const STACK_TARGET_ATTR = "data-stack-target";

/** DOM node svelte-dnd-action clones while a drag is in flight. */
export const DRAGGED_CLONE_SELECTOR = "#dnd-action-dragged-el";
