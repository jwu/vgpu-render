/** Sidebar metadata for the `2d-world-space-width` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = {
  ...page2D(
    "2d-world-space-width",
    "One `strokeWidth` value in two units across every shape's three forms: `<shape>`, `<shape>_s` and `<shape>_d`, each under `strokeWidthMode: \"screen\"` and `\"world\"`.",
    "Both units read the same number, so the only variable is the unit: `screen` is a canvas-pixel count that keeps its thickness at any zoom, `world` is `world2d` units multiplied by the camera zoom. `_s` is a fill with no outline, so it ignores the mode and its two columns stay identical at every zoom — the mode is a property of the outline, not of the shape. `arc` has no interior, so its `_s` cell is empty on purpose. Twelve rows keep the fitted zoom near 1, which is what fits the whole matrix on one page; the unit difference only becomes obvious once you scroll past that, and before that the page reads as a variant index.",
  ),
  // Pinned rather than derived from the label table: twelve rows would otherwise push the fitted
  // extent past 1600 world units and the gallery's fit would land the zoom below 1, where a
  // world-space outline is thinner than a screen-space one and the comparison reads backwards.
  view2d: { width: 1060, height: 960 },
};
