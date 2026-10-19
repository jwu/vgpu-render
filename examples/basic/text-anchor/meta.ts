/** Sidebar metadata for the `text-anchor` page. */

import type { SceneExample } from "../../shared/meta.js";
import { column } from "../../shared/meta.js";

export const meta: SceneExample = { id: "text-anchor", title: "Text Anchors", description: "The nine anchors against the position a block is handed and the bounds it lands in.", notes: "Not a reference port. The plus is the position the block is given, the box is the bounds it laid out into, and the label names the anchor — so both of the things an anchor moves between are visible at once.", implemented: true, group: "text", hideGrid: true, columns: [column("anchor", ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"])] };
