/**
 * `2d-markers`: crosses, points and axes.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { Vec2 } from "../../src/camera-2d.js";
import { ACCENT, ACTION, AXIS_X, AXIS_Y, COOL, cross, pageHeading, table2D } from "../shared/2d-page.js";

/** Two-axis cross: x red, y green, matching the 3D axes. */
function drawAxes(d2: FrameDrawList2D, origin: Vec2, length: number, width: number): void {
  d2.line(origin, [origin[0] + length, origin[1]], { width, color: AXIS_X });
  d2.line(origin, [origin[0], origin[1] + length], { width, color: AXIS_Y });
}

export function draw(drawList: FrameDrawList, _context: SceneContext): void {
  pageHeading(drawList, "2d-markers");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-markers");
  const crossSizes = [8, 16, 24, 32] as const;
  const pointSizes = [4, 8, 14, 22] as const;
  const roundSizes = [6, 10, 16, 24] as const;
  const axisLengths = [30, 45, 60, 80] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    cross(d2, [columnX(0), y], crossSizes[row]!, ACTION);
    d2.point([columnX(1), y], { size: pointSizes[row]!, color: ACCENT });
    d2.point([columnX(2), y], { size: roundSizes[row]!, round: true, color: COOL });
    drawAxes(d2, [columnX(3) - 40, y - 26], axisLengths[row]!, 4);
  }
}
