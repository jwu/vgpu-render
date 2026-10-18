/**
 * `2d-markers`: crosses, points, arrows with configurable tips, and axes.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { Vec2 } from "../../src/camera-2d.js";
import { ACCENT, ACTION, COOL, RING, WARM, cross, pageHeading, table2D } from "../shared/2d-page.js";

type ArrowOptions = {
  readonly color?: Color;
  readonly tipLength?: number;
  readonly tipWidth?: number;
  readonly doubleEnd?: boolean;
};

/** Arrow as a shaft plus a filled triangular head, the 2D twin of the 3D arrow helper. */
function drawArrow(d2: FrameDrawList2D, origin: Vec2, angle: number, length: number, options: ArrowOptions = {}): void {
  const color = options.color ?? ACTION;
  const tipLength = options.tipLength ?? 22;
  const tipWidth = options.tipWidth ?? 10;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tip: Vec2 = [origin[0] + ux * length, origin[1] + uy * length];
  d2.line(origin, tip, { width: 5, color });
  arrowHead(d2, tip, ux, uy, tipLength, tipWidth, color);
  if (options.doubleEnd === true) arrowHead(d2, origin, -ux, -uy, tipLength, tipWidth, color);
}

function arrowHead(
  d2: FrameDrawList2D,
  tip: Vec2,
  ux: number,
  uy: number,
  length: number,
  halfWidth: number,
  color: Color,
): void {
  const backX = tip[0] - ux * length;
  const backY = tip[1] - uy * length;
  d2.triangle(
    tip,
    [backX - uy * halfWidth, backY + ux * halfWidth],
    [backX + uy * halfWidth, backY - ux * halfWidth],
    { color },
  );
}

/** Two-axis cross: x in the action colour, y in the cool one, as bevy's `axes_2d`. */
function drawAxes(d2: FrameDrawList2D, origin: Vec2, length: number, width: number): void {
  d2.line(origin, [origin[0] + length, origin[1]], { width, color: ACTION });
  d2.line(origin, [origin[0], origin[1] + length], { width, color: COOL });
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-markers");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-markers");
  const crossSizes = [8, 16, 24, 32] as const;
  const pointSizes = [4, 8, 14, 22] as const;
  const roundSizes = [6, 10, 16, 24] as const;
  const arrowAngles = [-0.44, -0.14, 0.14, 0.44] as const;
  const tips = [8, 16, 24, 32] as const;
  const axisLengths = [30, 45, 60, 80] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    cross(d2, [columnX(0), y], crossSizes[row]!, ACTION);
    d2.point([columnX(1), y], { size: pointSizes[row]!, color: ACCENT });
    d2.point([columnX(2), y], { size: roundSizes[row]!, round: true, color: COOL });
    const arrowOrigin: Vec2 = [columnX(3) - 40, y - 16];
    drawArrow(d2, arrowOrigin, arrowAngles[row]!, 80, { color: WARM });
    drawArrow(d2, [columnX(4) - 40, y - 16], 0.42, 80, { color: RING, tipLength: tips[row]! });
    drawAxes(d2, [columnX(5) - 40, y - 26], axisLengths[row]!, 4);
  }
}
