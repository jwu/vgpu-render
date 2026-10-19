/**
 * The nested fills that make up a column of light.
 *
 * Four rectangles of the same family, drawn outer to inner: each is narrower, slightly shorter and
 * more opaque than the one before. The stacking is what turns a hard-edged rectangle into something
 * that reads as light — the outermost layer is a 8%-opacity haze and the innermost is the hot centre.
 *
 * One colour only: every layer is the same hue, and the falloff comes from the alpha ladder alone.
 * Nothing round is added on top — no ground pool, no tip bloom, no ring — so a page is just a shaft
 * and whatever its own timing does to it.
 *
 * Shared by `pillar-appear` (the column grows into view) and `pillar-fade` (it scatters away).
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { Color } from "../../src/frame-draw-list.js";
import { withAlpha } from "./params.js";

const LAYERS: readonly {
  readonly widthScale: number;
  readonly heightScale: number;
  /** Opacity share of this layer at full brightness. */
  readonly alpha: number;
}[] = [
  { widthScale: 1, heightScale: 1, alpha: 0.08 },
  { widthScale: 0.7, heightScale: 0.98, alpha: 0.16 },
  { widthScale: 0.4, heightScale: 0.95, alpha: 0.32 },
  { widthScale: 0.15, heightScale: 0.9, alpha: 0.9 },
];

/** How many fills one column is made of; exported so the tests can count without guessing. */
export const PILLAR_LAYER_COUNT = LAYERS.length;

/**
 * Draws one column standing on `ground`, growing upward.
 *
 * `alpha` scales every layer at once, so a caller fades the whole column with one number instead of
 * four. The ground point is the bottom edge — the caller decides where the floor is.
 */
export function drawPillarShaft(
  drawList: FrameDrawList,
  ground: readonly [number, number],
  width: number,
  height: number,
  alpha: number,
  color: Color,
): void {
  const d2 = drawList.d2;
  for (const layer of LAYERS) {
    const layerHeight = height * layer.heightScale;
    d2.rect_s([ground[0], ground[1] + layerHeight / 2], [width * layer.widthScale, layerHeight], {
      color: withAlpha(color, layer.alpha * alpha),
    });
  }
}
