/** Sidebar metadata for the `circle` page. */

import type { SceneExample } from "../shared/meta.js";
import { columnsOf, jointNote } from "../shared/meta.js";

export const meta: SceneExample = { id: "circle", title: "Circle", description: "Circle width, radius, segment count, rotation, joints, dashes, solid and normal variants.", notes: jointNote, implemented: true, columns: columnsOf("circle") };
