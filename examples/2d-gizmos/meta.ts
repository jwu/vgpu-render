/** Sidebar metadata for the `2d-gizmos` page. */

import type { SceneExample } from "../shared/meta.js";
import { column } from "../shared/meta.js";

export const meta: SceneExample = {
    id: "2d-gizmos",
    title: "2D Gizmos",
    description: "Immediate-mode 2D strokes in the camera-centred world2d space: lines, rays, joined strips, boxes, rounded boxes, circles, ellipses, arcs, crosses, arrows, curves and a grid.",
    notes: "Not a reference port: this page is built directly on frame.d2. world2d puts the origin at the canvas centre, +y up, one unit per canvas pixel before the camera's pan and zoom. Drag to pan, scroll to zoom.",
    implemented: true,
    family: "2d",
    // The 2D grid is part of what these pages demonstrate, so it opens on even if the
    // previous page had it off.
    hideGrid: false,
    view2d: { width: 1080, height: 640 },
    columns: [
      column("stroke", ["line", "ray", "linestrip", "rect", "roundedRect", "circle", "ellipse", "arc", "cross", "arrow", "curve", "grid"]),
      column("option", ["width", "joint", "dash", "fill", "strokeWidth", "startAngle", "sweep", "rotation", "space"]),
    ],
  };
