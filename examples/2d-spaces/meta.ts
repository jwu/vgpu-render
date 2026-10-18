/** Sidebar metadata for the `2d-spaces` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-spaces",
    "world2d versus screen, plus the width and size modes of each.",
    "The left column is `world2d` and moves with pan and zoom; the middle column is top-left origin canvas pixels and stays put, which is the point of the comparison. The right column shows a nominal width under `widthMode: \"screen\"` (constant pixels) and `widthMode: \"world\"` (scaled by zoom), and the same split for point sizes. The screen column is placed from the viewport, so it keeps its corner on any canvas size, and its labels are drawn in screen space rather than in the world matrix.",
  );
