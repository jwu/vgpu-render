/** Sidebar metadata for the `rect` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf, jointNote } from "../../shared/meta.js";

export const meta: SceneExample = { id: "rect", title: "Rect", description: "Wire and solid rectangles with size, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: columnsOf("rect") };
