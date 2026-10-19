/**
 * Shared segment bookkeeping for the `zIndex` layering key.
 *
 * 2D primitives and text live in separate instance collections with separate draws, but they
 * compete for the same layering key: a higher `zIndex` must be drawn later, whichever renderer
 * owns it. The pieces here are the whole CPU side of that: stable ordering, the distinct keys a
 * frame used, and the instance runs each key owns.
 *
 * The approach leans on one property of the instance collections: instance `n` keeps slot `n`
 * because `trim()` only removes from the tail. Writing commands in `zIndex` order therefore
 * regroups the buffer into one contiguous run per key, and a run is drawn with a single call
 * carrying `{ instances, firstInstance }`. `tests/z-index.gpu.test.ts` pins that down.
 */

/** A contiguous run of instances drawn with one call. */
export type SegmentRange = { readonly start: number; readonly count: number };

/** A key with no instances in this renderer; the draw path skips it. */
export const EMPTY_RANGE: SegmentRange = { start: 0, count: 0 };

/**
 * Stable ascending sort by `zIndex`. `Array.prototype.sort` is stable, so commands that share a
 * key keep their recording order, which is what makes an unannotated frame pixel-identical to the
 * pre-`zIndex` draw order.
 */
export function sortedByZIndex<T extends { readonly zIndex: number }>(commands: readonly T[]): readonly T[] {
  return [...commands].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Every distinct key across `groups`, ascending. Groups arrive in draw-priority order, which
 * fixes the order of renderers that share a key without needing to compare them individually.
 */
export function orderedZIndexes(groups: readonly (readonly number[])[]): number[] {
  const seen = new Set<number>();
  for (const group of groups) for (const value of group) seen.add(value);
  return [...seen].sort((a, b) => a - b);
}

/** {@link orderedZIndexes} for groups of commands that carry the key themselves. */
export function zIndexesOf(groups: readonly (readonly { readonly zIndex: number }[])[]): number[] {
  return orderedZIndexes(groups.map((group) => group.map((command) => command.zIndex)));
}

/** Instance runs of one already-sorted command list, one per key. */
export function rangesByZIndex(sorted: readonly { readonly zIndex: number }[], zIndexes: readonly number[]): SegmentRange[] {
  const ranges: SegmentRange[] = [];
  let cursor = 0;
  // Both sides ascend, so a single pass assigns every run; a key this list does not use gets an
  // empty range instead of breaking the alignment with `zIndexes`.
  for (const zIndex of zIndexes) {
    const start = cursor;
    while (cursor < sorted.length && sorted[cursor]!.zIndex === zIndex) cursor++;
    ranges.push({ start, count: cursor - start });
  }
  return ranges;
}
