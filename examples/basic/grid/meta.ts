/** Sidebar metadata for the `grid` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf } from "../../shared/meta.js";

export const meta: SceneExample = { id: "grid", title: "Grid", description: "Grid width, cell count, spacing, skew, outer edges, rotation, color, and normal rows.", notes: "Column spacing follows each column's measured bounds; rendered skew and outer edges use the library grid semantics.", implemented: true, columns: columnsOf("grid") };
