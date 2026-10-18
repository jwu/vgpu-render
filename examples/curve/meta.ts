/** Sidebar metadata for the `curve` page. */

import type { SceneExample } from "../shared/meta.js";
import { columnsOf, jointNote } from "../shared/meta.js";

export const meta: SceneExample = { id: "curve", title: "Curve", description: "Curve widths, shape, transform, tolerance, closed paths, joints and dashes.", notes: jointNote + " Cubic Bezier control points are sampled adaptively from the tolerance row, and the construction band draws the reference anchor and control markers.", implemented: true, columns: columnsOf("curve") };
