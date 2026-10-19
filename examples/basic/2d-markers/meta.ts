/** Sidebar metadata for the `2d-markers` page. */

import type { SceneExample } from "../../shared/meta.js";
import { page2D } from "../../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-markers",
  "Crosses, points with square and round caps, and axes.",
  "The markers bevy's 2D gizmos draw as bespoke helpers. A point's `size` is in canvas pixels by default and `sizeMode: \"world\"` opts into zoom-scaled units; crosses and axes are composed from strokes.",
);
