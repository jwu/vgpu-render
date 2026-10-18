/** Sidebar metadata for the `2d-shapes` page. */

import type { SceneExample } from "../shared/meta.js";
import { column } from "../shared/meta.js";

export const meta: SceneExample = {
    id: "2d-shapes",
    title: "2D Shapes",
    description: "Twelve 2D primitives as filled shapes, with their stroked outlines underneath.",
    notes: "Not a reference port: this page is built on frame.d2 shape primitives. Each shape is one instanced quad evaluated as a signed distance field, so an outline width is a pixel count at any zoom and nothing is triangulated on the CPU. Drag to pan, scroll to zoom.",
    implemented: true,
    family: "2d",
    // The 2D grid is part of what these pages demonstrate, so it opens on even if the
    // previous page had it off.
    hideGrid: false,
    view2d: { width: 1260, height: 560 },
    columns: [
      column("filled", ["circle", "sector", "segment", "ellipse", "annulus", "capsule", "rhombus", "rect", "polygon", "triangle", "segment2d", "polyline2d"]),
      column("ring", ["circle", "sector", "segment", "ellipse", "annulus", "capsule", "rhombus", "rect", "polygon", "triangle"]),
    ],
  };
