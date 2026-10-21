/**
 * `2d-rhombus`: normal diagonals / rotation / stroke / color / alpha, then the dashed outline, a
 * combined solid sample and a hatched fill.
 */

import type { Vec2 } from "../../../src/camera-2d.js";
import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, hatchSample, table2D, withAlpha } from "../../shared/2d-page.js";

const DIAGONALS: readonly Vec2[] = [[60, 80], [84, 56], [72, 72], [90, 76]];
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const ROTATED: Vec2 = [46, 68];
const STROKES = [1, 2, 4, 8] as const;
const STROKED: Vec2 = [72, 76];
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-rhombus");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.rhombus([shapeX(0), y], DIAGONALS[row], { strokeWidth: 2, color: RING });
    d2.rhombus([shapeX(1), y], ROTATED, {
      rotation: ROTATIONS[row],
      strokeWidth: 2,
      color: WARM,
    });
    d2.rhombus([shapeX(2), y], STROKED, { strokeWidth: STROKES[row], color: RING });
    d2.rhombus([shapeX(3), y], STROKED, { strokeWidth: 2, color: COLORS[row] });
    d2.rhombus([shapeX(4), y], STROKED, {
      strokeWidth: 2,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.rhombus_d([shapeX(5), y], STROKED, [visible, gap, dashPhase], {
      strokeWidth: 2,
      color: COOL,
    });
    d2.rhombus_s([shapeX(6), y], DIAGONALS[row], {
      rotation: ROTATIONS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
    d2.rhombus_h([shapeX(7), y], DIAGONALS[row], {
      rotation: ROTATIONS[row],
      hatch: hatchSample(row, dashPhase),
      color: COLORS[row],
    });
  }
}
