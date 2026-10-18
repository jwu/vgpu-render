/** Sidebar metadata for the `2d-arrows` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-arrows",
  "Arrow API across width, head length, head angle, direction, joint and dashes: `arrow` keeps the open line head and `arrow_s` fills it.",
  "`arrow` draws the shaft plus an open V head (two lines), `arrow_s` replaces that head with a filled triangle, and `arrow_d` / `arrow_s_d` apply the dash pattern to the same two shapes. Head length defaults to a quarter of the shaft (clamped to 6..14) and the half-angle to 30 degrees. Columns pair the two forms side by side wherever the parameter applies to both.",
);
