/** Sidebar metadata for the `2d-index` page. */

import type { SceneExample } from "../../shared/meta.js";
import { column } from "../../shared/meta.js";

export const meta: SceneExample = {
  id: "2d-index",
  title: "2D Index",
  description: "Every 2D primitive family in one grid, the 2D counterpart of the 3D index page.",
  notes: "Each cell is one API call under its name: strokes (line, line_d, ray, lineStrip, lineLoop, grid), markers (point), arrows (arrow, arrow_s), curves (curve) and the shape trio forms (rect / rect_r / rect_d / rect_s, circle / circle_s, ellipse, arc, annulus, capsule, polygon, triangle, rhombus, sector, segment).",
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: { width: 1300, height: 900 },
  columns: [
    column("cells", [
      "line", "line_d", "ray", "lineStrip", "lineLoop", "grid", "point", "arrow", "arrow_s", "curve",
      "rect", "rect_r", "rect_d", "rect_s", "circle", "circle_s", "ellipse", "arc", "annulus", "capsule",
      "polygon", "triangle", "rhombus", "sector", "segment",
    ]),
  ],
};
