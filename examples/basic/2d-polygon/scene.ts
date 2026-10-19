/**
 * `2d-polygon`: normal sides / circumradius / rotation / color / alpha, then the dashed outline
 * and a combined solid sample.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, table2D, withAlpha } from "../../shared/2d-page.js";

const SIDES = [3, 4, 6, 12] as const;
const RADII = [20, 26, 32, 40] as const;
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-polygon");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.polygon([shapeX(0), y], 40, SIDES[row], { strokeWidth: 2, color: RING });
    d2.polygon([shapeX(1), y], RADII[row], 6, { strokeWidth: 2, color: RING });
    d2.polygon([shapeX(2), y], 40, 6, {
      rotation: ROTATIONS[row],
      strokeWidth: 2,
      color: WARM,
    });
    d2.polygon([shapeX(3), y], 40, 6, { strokeWidth: 2, color: COLORS[row] });
    d2.polygon([shapeX(4), y], 40, 6, { strokeWidth: 2, color: withAlpha(COOL, ALPHAS[row]) });
    const [visible, gap] = DASHES[row];
    d2.polygon_d([shapeX(5), y], 40, 6, [visible, gap, dashPhase], { strokeWidth: 2, color: COOL });
    d2.polygon_s([shapeX(6), y], 36, SIDES[row], {
      rotation: ROTATIONS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
  }
}
