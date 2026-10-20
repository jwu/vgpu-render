/**
 * The nested fills that make up a column of light.
 *
 * A ladder of rectangles of the same family, drawn outer to inner: each is narrower, slightly shorter
 * and more opaque than the one before. The stacking is what turns a hard-edged rectangle into
 * something that reads as light — the outermost layer is a 6%-opacity haze and the innermost is the
 * hot centre.
 *
 * One colour only: every layer is the same hue, and the falloff comes from the alpha ladder alone.
 * Nothing round is added on top — no tip bloom, no ring — so a page is just a shaft and whatever its
 * own timing does to it.
 *
 * Used by `light-pillar`, which grows the column, holds it and then scatters it into a haze.
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
  { widthScale: 1, heightScale: 1, alpha: 0.055 },
  { widthScale: 0.84, heightScale: 0.99, alpha: 0.085 },
  { widthScale: 0.68, heightScale: 0.975, alpha: 0.13 },
  { widthScale: 0.5, heightScale: 0.955, alpha: 0.19 },
  { widthScale: 0.32, heightScale: 0.93, alpha: 0.3 },
  { widthScale: 0.15, heightScale: 0.9, alpha: 0.85 },
];

/** How many fills one column is made of; exported so the tests can count without guessing. */
export const PILLAR_LAYER_COUNT = LAYERS.length;

/**
 * Draws one column standing on `ground`, growing upward.
 *
 * `alpha` scales every layer at once, so a caller fades the whole column with one number instead of
 * four. The ground point is the bottom edge — the caller decides where the floor is.
 *
 * `blur` (0-1) folds the layers towards the outer width: at 1 every fill is as wide as the shaft and
 * the column reads as one wide haze instead of a bright filament inside a dimmer body. That is how a
 * scattering column loses its definition without losing its colour.
 *
 * Folding also pulls the opacity down hard (`1 - 0.7 * blur`). The four alphas add up to 1.46 at
 * their own widths; at one shared width that same ladder is a bright solid block, not a haze. The
 * 0.7 is chosen so the *sum of alpha × width* stays roughly where it started.
 */
export function drawPillarShaft(
  drawList: FrameDrawList,
  ground: readonly [number, number],
  width: number,
  height: number,
  alpha: number,
  color: Color,
  blur = 0,
): void {
  const d2 = drawList.d2;
  const spread = blur < 0 ? 0 : blur > 1 ? 1 : blur;
  for (const layer of LAYERS) {
    // A loose fill opens towards the outer width; a tight one follows only halfway, so the ladder
    // survives the fold instead of collapsing into four rectangles of one width.
    const widthScale = layer.widthScale + (1 - layer.widthScale) * spread * 0.55;
    const heightScale = layer.heightScale + (1 - layer.heightScale) * spread * 0.55;
    // The core goes first: `widthScale` doubles as "how loose this fill is", so the tightest fill
    // loses the most opacity. That is what turns a shaft into a haze — the bright middle leaves and
    // the loose edges are what is left standing.
    const coreLoss = 1 - (1 - layer.widthScale) * spread * 0.75;
    const layerHeight = height * heightScale;
    d2.rect_s([ground[0], ground[1] + layerHeight / 2], [width * widthScale, layerHeight], {
      color: withAlpha(color, layer.alpha * alpha * coreLoss * (1 - 0.4 * spread)),
    });
  }
}
