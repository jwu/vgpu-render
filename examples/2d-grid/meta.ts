/** Sidebar metadata for the `2d-grid` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-grid",
  "The grid primitive with the 3D grid's parameter set: width, cells, spacing, skew, outer edges, rotation and color.",
  "`grid` is a line-family primitive. Rotation is one anticlockwise angle around the grid centre; `outer` keeps the x or y boundary lines, the 2D counterpart of the 3D x/z edges. The cell and spacing columns keep a fixed opposite parameter so each row stays comparable.",
);
