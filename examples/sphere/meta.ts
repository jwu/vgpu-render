/** Sidebar metadata for the `sphere` page. */

import type { SceneExample } from "../shared/meta.js";
import { columnsOf } from "../shared/meta.js";

export const meta: SceneExample = {
    id: "sphere",
    title: "Sphere",
    description: "Sphere wire and solid meshes across width, radius, segment, axis, dash, joint and normal rows.",
    notes: "Reference has 14 columns including y/z axis and sphere_s; the UV generator approximates the independent axis ring counts.",
    implemented: true,
    columns: columnsOf("sphere"),
  };
