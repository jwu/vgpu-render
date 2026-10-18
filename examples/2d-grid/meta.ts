/** Sidebar metadata for the `2d-grid` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-grid",
    "The grid primitive: cell count per column, line width per row, one fixed extent.",
    "`grid` is a line-family primitive, so every grid here is drawn from individual strokes and inherits the line width. Cell count changes spacing rather than extent, which is what makes the four columns comparable; bevy's `outer_edges` toggle has no counterpart in this layer.",
  );
