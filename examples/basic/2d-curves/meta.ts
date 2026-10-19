/** Sidebar metadata for the `2d-curves` page. */

import type { SceneExample } from "../../shared/meta.js";
import { page2D } from "../../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-curves",
    "Cubic curve sampling with a construction band that shows every control point, then width, shape, transform, tolerance, closed and dash columns.",
    "`curve` samples a cubic control polygon into a `lineStrip`, the 2D twin of the 3D curve page. The construction band under the matrix draws the reference control points — pink anchors, amber handles and their edges — for the straight, smooth, flat-handle, broken, one-sided, y and closed curves. `curve(tolerance)` trades polygon density against smoothness, `curve(closed)` pairs an open curve with three closed variants, and dashes reuse the same accumulated phase as every other 2D stroke.",
  );
