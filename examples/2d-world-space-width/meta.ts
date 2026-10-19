/** Sidebar metadata for the `2d-world-space-width` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = {
  ...page2D(
    "2d-world-space-width",
    "One width value in two units: `widthMode` on strokes, `sizeMode` on points and `strokeWidthMode` on shape outlines, each as canvas pixels or as `world2d` units.",
    "`screen` is a pixel count: the primitive keeps its thickness however far the camera zooms. `world` is measured in `world2d` units and is multiplied by the camera zoom, so it grows with the scene. Both rows read the same number, so the only variable is the unit — drawing two different numbers would prove nothing. Scroll to zoom and only the `world` row changes. `screen` commands have no zoom of their own, so the two modes coincide in that space.",
  ),
  // A tighter extent than the three-column label table would derive. The gallery fits this
  // extent to the canvas, and that fitted zoom is what makes the world row visibly thicker than
  // the screen row; at the derived 660 × 460 the zoom lands near 1 and the two rows coincide.
  view2d: { width: 560, height: 360 },
};
