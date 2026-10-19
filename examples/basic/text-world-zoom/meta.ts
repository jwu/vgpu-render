/** Sidebar metadata for the `text-world-zoom` page. */

import type { SceneExample } from "../../shared/meta.js";
import { column } from "../../shared/meta.js";

export const meta: SceneExample = { id: "text-world-zoom", title: "Text World Zoom", description: "Four sources in world space, made to be magnified with the camera.", notes: "Not a reference port. Screen-space text cannot be magnified — a larger block is simply a request for a new rasterisation — so world-space rows are the only honest test of what a source does past the size its glyphs were built at. Scroll to move the camera in and out: a coverage source runs into the texels it stored, a distance field keeps rebuilding the edge from them.", implemented: true, group: "text", hideGrid: false, columns: [column("source", ["bitmap 1x", "bitmap 4x", "sdf 4x", "msdf baked"]), column("past its raster", ["shows the stored texels", "shows smaller texels", "rebuilds the edge", "rebuilds from a 24 px page"])] };
