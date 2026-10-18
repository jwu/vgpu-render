/** Sidebar metadata for the `2d-annulus` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D, shape2DNote } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-annulus",
  "Annulus normal outline across both radii, stroke width, color and alpha, plus the dashed outline and a combined solid sample.",
  shape2DNote,
);
