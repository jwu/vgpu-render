/** Sidebar metadata for the `world_space_width` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf } from "../../shared/meta.js";

export const meta: SceneExample = { id: "world_space_width", title: "World Space Width", description: "The 17-column primitive matrix rendered with world-space line widths and without the `*_s` solid columns.", notes: "Widths are `_world_width(px) = px * 0.01`; row labels mirror the reference.", implemented: true, columns: columnsOf("world_space_width") };
