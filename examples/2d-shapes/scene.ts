/**
 * `2d-shapes`: the twelve 2D primitives, filled in one row and outlined in the next.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import { FILL, RING, heading } from "../shared/2d-page.js";

/** One column of the page, in the order bevy's `2d_shapes` example lists them. */
function drawShape(d2: FrameDrawList2D, shape: number, center: [number, number], filled: boolean): void {
  const style = { fill: filled, strokeWidth: 4, color: filled ? FILL : RING };
  const [x, y] = center;
  switch (shape) {
    case 0: // Circle::new(50)
      d2.circle(center, 50, style);
      return;
    case 1: // CircularSector::new(50, 1.0)
      d2.sector(center, 50, { ...style, sweep: 1.0 });
      return;
    case 2: // CircularSegment::new(50, 1.25)
      d2.segment(center, 50, { ...style, sweep: 1.25 });
      return;
    case 3: // Ellipse::new(25, 50)
      d2.ellipse(center, [25, 50], style);
      return;
    case 4: // Annulus::new(25, 50)
      d2.annulus(center, 25, 50, style);
      return;
    case 5: // Capsule2d::new(25, 50)
      d2.capsule(center, 25, 50, style);
      return;
    case 6: // Rhombus::new(75, 100)
      d2.rhombus(center, [75, 100], style);
      return;
    case 7: // Rectangle::new(50, 100)
      d2.rect(center, [50, 100], style);
      return;
    case 8: // RegularPolygon::new(50, 6)
      d2.polygon(center, 50, 6, style);
      return;
    case 9: // Triangle2d::new(Vec2::Y * 50, Vec2::new(-50, -50), Vec2::new(50, -50))
      d2.triangle([x, y + 50], [x - 50, y - 50], [x + 50, y - 50], style);
      return;
    case 10: // Segment2d::new(Vec2::new(-50, 50), Vec2::new(50, -50))
      d2.line([x - 50, y + 50], [x + 50, y - 50], { width: 8, color: filled ? FILL : RING });
      return;
    default: // Polyline2d::new([(-50, 50), (0, -50), (50, 50)])
      d2.lineStrip([[x - 50, y + 50], [x, y - 50], [x + 50, y + 50]], {
        width: 8,
        joint: "round",
        color: filled ? FILL : RING,
      });
  }
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(drawList, "2D Shapes", "filled row, ring row · drag or WASD to pan, scroll to zoom");
  const d2 = drawList.d2;
  const columns = 12;
  const spacing = 100;
  const startX = -((columns - 1) * spacing) / 2;
  for (let index = 0; index < columns; index++) {
    const x = startX + index * spacing;
    drawShape(d2, index, [x, 110], true);
    // The two polyline shapes have no interior to outline.
    if (index < 10) drawShape(d2, index, [x, -110], false);
  }
}
