/**
 * `2d-circle`: normal radius / stroke / color / alpha, then the dashed outline and a combined
 * solid sample.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, table2D, withAlpha } from "../../shared/2d-page.js";

const RADII = [18, 26, 34, 40] as const;
const STROKES = [1, 2, 4, 8] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_RADII = [20, 28, 36, 40] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-circle");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.circle([shapeX(0), y], RADII[row], { strokeWidth: 2, color: RING });
    d2.circle([shapeX(1), y], 40, { strokeWidth: STROKES[row], color: RING });
    d2.circle([shapeX(2), y], 40, { strokeWidth: 2, color: COLORS[row] });
    d2.circle([shapeX(3), y], 40, { strokeWidth: 2, color: withAlpha(COOL, ALPHAS[row]) });
    const [visible, gap] = DASHES[row];
    d2.circle_d([shapeX(4), y], 40, [visible, gap, dashPhase], { strokeWidth: 2, color: COOL });
    d2.circle_s([shapeX(5), y], SOLID_RADII[row], {
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
  }
}
