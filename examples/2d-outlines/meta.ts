/** Sidebar metadata for the `2d-outlines` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-outlines",
    "Six shape primitives in their stroked form, one stroke width per row.",
    "The same SDF quad the filled shapes use, shaded as an outline: `fill: false` plus `strokeWidth` measures the ring in canvas pixels at any zoom, so the row values stay comparable. This is the 2D counterpart of bevy's `to_ring` outline row on the shapes page.",
  );
