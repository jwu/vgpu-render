/** Sidebar metadata for the `2d-lines` page. */

import type { SceneExample } from "../../shared/meta.js";
import { page2D } from "../../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-lines",
    "Line variants: width, alpha, gradient, dash, and open strip versus closed loop, each solid and dashed.",
    "A matrix page in the shape of the 3D reference scenes, not another collage. Column titles and sample labels are world2d text, so they pan and zoom with the strokes they annotate. Every sample is one `frame.d2` call: the width and alpha columns come from the same triple bevy's gizmo config uses, the gradient uses `colorEnd`, and the four joint columns rebuild the wedge from the three path points — the strip stays open, the loop closes the path so the wrap-around corner is visible, and the `_d` pair adds the dash phase across the whole path.",
  );
