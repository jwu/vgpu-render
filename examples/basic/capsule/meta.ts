/** Sidebar metadata for the `capsule` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf } from "../../shared/meta.js";

export const meta: SceneExample = {
    id: "capsule",
    title: "Capsule",
    description: "Capsule wire meshes across width, radius, half height, segment, rotation, joint and normal rows.",
    notes: "Reference has 9 columns and no solid column: the capsule reference has no solid variant.",
    implemented: true,
    columns: columnsOf("capsule"),
  };
