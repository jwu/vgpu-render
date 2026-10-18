/** Sidebar metadata for the `2d-arrows` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-arrows",
  "Filled and line arrow heads across width, head length, head angle, direction, joint and dash.",
  "Both styles share one shaft and the same open V outline; the outline's `joint` finishes the tip, so the filled head rounds like the line head instead of ending in a raw triangle corner. Columns follow the 3D arrow page: the same parameter table, with filled and line paired side by side.",
);
