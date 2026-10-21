/** Sidebar metadata for the `2d-segment` page. */

import type { SceneExample } from "../../shared/meta.js";
import { page2D, shape2DNote } from "../../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-segment",
  "Segment normal outline across sweep, start angle, radius, color and alpha, plus the dashed outline, a combined solid sample and a hatched fill.",
  shape2DNote,
);
