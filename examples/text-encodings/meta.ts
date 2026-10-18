/** Sidebar metadata for the `text-encodings` page. */

import type { SceneExample } from "../shared/meta.js";
import { column } from "../shared/meta.js";

export const meta: SceneExample = { id: "text-encodings", title: "Text Encodings", description: "One sentence from four glyph sources, at two sizes, plus the outline pair.", notes: "Not a reference port: there is no upstream text API, so this is vgpu's own capability. Every block takes the default source — the one that rasterises each glyph at the size it covers on screen — except the columns that name one, so the page doubles as the gallery's own quality check. The lower band repeats the same ink at more than twice the size, which is where a coverage source and a distance field stop looking alike.", implemented: true, group: "text", hideGrid: true, columns: [column("source", ["bitmap 1x", "sdf 4x", "msdf 2x", "msdf baked"]), column("what changes", ["coverage interpolation", "distance reconstruction", "per-edge distance", "prebaked at 24 px"]), column("outline", ["reads the true distance in alpha", "samples coverage in eight directions"])] };
