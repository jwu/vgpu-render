/** Sidebar metadata for the `2d-arrows` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-arrows",
  "Filled and line arrow heads across width, head length, head angle, direction, joint and dash.",
  "Both styles share one shaft. The line head is an open V whose `joint` finishes the tip; the filled head is a clean triangle with a disc at the tip, so its base corners stay sharp instead of growing the V outline's round end-caps. Columns follow the 3D arrow page: the same parameter table, with filled and line paired side by side where the parameter applies to both.",
);
