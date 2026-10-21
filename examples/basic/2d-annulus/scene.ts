/**
 * `2d-annulus`: normal inner / outer / stroke / color / alpha, then the dashed outline, a combined
 * solid band sample and a hatched band.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, hatchSample, table2D, withAlpha } from "../../shared/2d-page.js";

const INNERS = [6, 14, 22, 30] as const;
const OUTERS = [30, 34, 38, 40] as const;
const STROKES = [1, 2, 4, 8] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-annulus");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.annulus([shapeX(0), y], INNERS[row], 36, { strokeWidth: 2, color: RING });
    d2.annulus([shapeX(1), y], 14, OUTERS[row], { strokeWidth: 2, color: RING });
    d2.annulus([shapeX(2), y], 16, 34, { strokeWidth: STROKES[row], color: RING });
    d2.annulus([shapeX(3), y], 16, 34, { strokeWidth: 2, color: COLORS[row] });
    d2.annulus([shapeX(4), y], 16, 34, {
      strokeWidth: 2,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.annulus_d([shapeX(5), y], 16, 34, [visible, gap, dashPhase], { strokeWidth: 2, color: COOL });
    d2.annulus_s([shapeX(6), y], INNERS[row], OUTERS[row], {
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
    d2.annulus_h([shapeX(7), y], INNERS[row], OUTERS[row], {
      hatch: hatchSample(row, dashPhase),
      color: COLORS[row],
    });
  }
}
