/** Sidebar metadata for the `text-scale` page. */

import type { SceneExample } from "../shared/meta.js";
import { column } from "../shared/meta.js";

export const meta: SceneExample = { id: "text-scale", title: "Text Scale", description: "One sentence at six sizes, over three raster strategies at one size.", notes: "Not a reference port. The top row puts 26 px under the screen-driven ladder, a fixed 1x raster and a fixed 4x raster; the rows below run 8 px to 96 px, so the rung changes — and the absence of a soft step between them — are visible in one frame. The first strategy is what a caller gets by default.", implemented: true, group: "text", hideGrid: true, columns: [column("raster", ["screen decides the rung", "fixed 1x", "fixed 4x"]), column("sizes", ["8 px", "12 px", "18 px", "28 px", "48 px", "96 px"])] };
