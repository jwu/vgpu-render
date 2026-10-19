/** Sidebar metadata for the `cylinder` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf } from "../../shared/meta.js";

export const meta: SceneExample = {
    id: "cylinder",
    title: "Cylinder",
    description: "Cylinder wire and solid meshes across width, radius, half height, segment, rotation, joint and normal rows.",
    notes: "Reference has 10 columns including cylinder_s; the generator uses one segment count for the base ring and side lines.",
    implemented: true,
    columns: columnsOf("cylinder"),
  };
