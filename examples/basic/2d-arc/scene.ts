/**
 * `2d-arc`: normal sweep / startAngle / radius / stroke / color / alpha, then the dashed variant
 * and the striped stroke — an arc has no interior, so its hatch lands on the band.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, hatchSample, table2D, withAlpha } from "../../shared/2d-page.js";

const SWEEPS = [Math.PI / 3, (Math.PI * 2) / 3, (Math.PI * 4) / 3, (Math.PI * 11) / 6] as const;
const STARTS = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2] as const;
const RADII = [22, 30, 36, 40] as const;
const STROKES = [1, 2, 4, 8] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const ARC_SWEEP = Math.PI * 1.2;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-arc");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    // An arc has no interior, so it is only ever stroked; the dashed variant cuts that stroke.
    d2.arc([shapeX(0), y], 40, { sweep: SWEEPS[row], strokeWidth: 4, color: RING });
    d2.arc([shapeX(1), y], 40, {
      startAngle: STARTS[row],
      sweep: (Math.PI * 2) / 3,
      strokeWidth: 4,
      color: WARM,
    });
    d2.arc([shapeX(2), y], RADII[row], { sweep: ARC_SWEEP, strokeWidth: 4, color: RING });
    d2.arc([shapeX(3), y], 40, { sweep: ARC_SWEEP, strokeWidth: STROKES[row], color: RING });
    d2.arc([shapeX(4), y], 40, { sweep: ARC_SWEEP, strokeWidth: 4, color: COLORS[row] });
    d2.arc([shapeX(5), y], 40, {
      sweep: ARC_SWEEP,
      strokeWidth: 4,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.arc_d([shapeX(6), y], 40, [visible, gap, dashPhase], {
      sweep: ARC_SWEEP,
      strokeWidth: 4,
      color: COOL,
    });
    // Wide enough to read the stripes: on an arc the hatch masks the band, not an interior.
    d2.arc_h([shapeX(7), y], 40, {
      sweep: ARC_SWEEP,
      strokeWidth: 10,
      hatch: hatchSample(row, dashPhase),
      color: COLORS[row],
    });
  }
}
