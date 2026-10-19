/** Sidebar metadata for the `arc` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf, jointNote } from "../../shared/meta.js";

export const meta: SceneExample = { id: "arc", title: "Arc", description: "Arc width, radius, angle, segments, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: columnsOf("arc") };
