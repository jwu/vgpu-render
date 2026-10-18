/** Sidebar metadata for the `cone` page. */

import type { SceneExample } from "../shared/meta.js";
import { columnsOf } from "../shared/meta.js";

export const meta: SceneExample = {
    id: "cone",
    title: "Cone",
    description: "Cone wire and solid meshes across width, radius, height, segment, rotation, joint and normal rows.",
    notes: "Reference has 10 columns including cone_s; the generator uses one segment count for the base ring and side lines.",
    implemented: true,
    columns: columnsOf("cone"),
  };
