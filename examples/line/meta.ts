/** Sidebar metadata for the `line` page. */

import type { SceneExample } from "../shared/meta.js";
import { columnsOf, jointNote } from "../shared/meta.js";

export const meta: SceneExample = { id: "line", title: "Line", description: "Widths, alpha, dashes, strip and loop joints, dashed joints, and normal-aware lines.", notes: jointNote, implemented: true, columns: columnsOf("line") };
