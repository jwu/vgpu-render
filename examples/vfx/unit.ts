/**
 * The battle unit disc, shared by the pages that put an effect on a victim.
 *
 * The two pages that need a body (`hit-mark`, `hit-flash`) draw the same disc: a filled circle plus a
 * bright rim. Its colours are HSV-derived rather than one hard-coded RGB, so the hue and saturation
 * sliders can recolour it; the defaults reproduce the simulator's ally palette (`#1a4a8f` body,
 * `#7be0ff` rim), where the rim sits a touch bluer and much paler than the body — that difference is
 * what makes the edge read at gallery zoom.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import { hueColor, withAlpha } from "./params.js";

/** Value (HSV) of the body: the navy is dark, so the white flash and the mark both stand out on it. */
const UNIT_VALUE = 0.56;
/** The rim's hue is this much bluer than the body's. */
const RIM_HUE_SHIFT = -0.06;
/** The rim is a pale version of the body's hue, not the same saturation. */
const RIM_SATURATION_SCALE = 0.63;
/** Body opacity: the grid behind it still shows through, which keeps the page readable. */
const UNIT_OPACITY = 0.92;

export function drawUnitDisc(
  drawList: FrameDrawList,
  center: readonly [number, number],
  radius: number,
  hue: number,
  saturation: number,
): void {
  const d2 = drawList.d2;
  d2.circle_s(center, radius, { color: withAlpha(hueColor(hue, saturation, UNIT_VALUE), UNIT_OPACITY) });
  d2.circle(center, radius, {
    strokeWidth: 2,
    color: hueColor(hue + RIM_HUE_SHIFT, saturation * RIM_SATURATION_SCALE, 1),
  });
}
