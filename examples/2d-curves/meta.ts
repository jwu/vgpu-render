/** Sidebar metadata for the `2d-curves` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-curves",
    "Arc sweep, start angle, short and long arcs between points, and sampled curves.",
    "`short_arc_2d_between` and `long_arc_2d_between` are not separate calls in this layer: the page computes the sweep from the two directions and draws one `arc`, which is what makes the pair comparable. The curve columns sample a sine into a strip; the gradient column interpolates the segment colours itself, because a strip's `colorEnd` repeats per segment.",
  );
