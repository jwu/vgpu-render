/** Sidebar metadata for the `arrow` page. */

import type { SceneExample } from "../../shared/meta.js";
import { columnsOf, jointNote } from "../../shared/meta.js";

export const meta: SceneExample = { id: "arrow", title: "Arrow", description: "Arrow direction, width, head length, head angle, joints, normal-aware arrows, and arrow-line variants.", notes: jointNote + " Head angle and length are wired to arrow geometry.", implemented: true, columns: columnsOf("arrow") };
