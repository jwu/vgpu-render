/** Sidebar metadata for the `index` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf } from "../../shared/meta.js";

export const meta: SceneExample = { id: "index", title: "Index", description: "The DebugDraw3D API matrix: 17 primitive columns with the reference per-column row sets.", notes: "Overview of every primitive family; row labels mirror the reference draw calls.", implemented: true, columns: columnsOf("index") };
