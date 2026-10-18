/** Sidebar metadata for the `2d-sector` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D, shape2DNote } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-sector",
  "Sector normal outline across sweep, start angle, radius, color and alpha, plus the dashed outline and a combined solid sample.",
  shape2DNote,
);
