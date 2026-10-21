/**
 * `2d-sector`: normal sweep / startAngle / radius / color / alpha, then the dashed outline, a
 * combined solid sample and a hatched wedge.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, hatchSample, table2D, withAlpha } from "../../shared/2d-page.js";

const SWEEPS = [Math.PI / 3, (Math.PI * 2) / 3, (Math.PI * 4) / 3, (Math.PI * 11) / 6] as const;
const STARTS = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2] as const;
const RADII = [22, 30, 36, 40] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const SWEEP = (Math.PI * 2) / 3;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-sector");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.sector([shapeX(0), y], 40, {
      startAngle: -Math.PI / 2,
      sweep: SWEEPS[row],
      strokeWidth: 2,
      color: RING,
    });
    d2.sector([shapeX(1), y], 40, {
      startAngle: STARTS[row],
      sweep: SWEEP,
      strokeWidth: 2,
      color: WARM,
    });
    d2.sector([shapeX(2), y], RADII[row], {
      startAngle: -Math.PI / 2,
      sweep: SWEEP,
      strokeWidth: 2,
      color: RING,
    });
    d2.sector([shapeX(3), y], 40, {
      startAngle: -Math.PI / 2,
      sweep: SWEEP,
      strokeWidth: 2,
      color: COLORS[row],
    });
    d2.sector([shapeX(4), y], 40, {
      startAngle: -Math.PI / 2,
      sweep: SWEEP,
      strokeWidth: 2,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.sector_d([shapeX(5), y], 40, [visible, gap, dashPhase], {
      startAngle: -Math.PI / 2,
      sweep: SWEEP,
      strokeWidth: 2,
      color: COOL,
    });
    d2.sector_s([shapeX(6), y], 36, {
      startAngle: STARTS[row],
      sweep: SWEEPS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
    d2.sector_h([shapeX(7), y], 36, {
      startAngle: STARTS[row],
      sweep: SWEEPS[row],
      hatch: hatchSample(row, dashPhase),
      color: COLORS[row],
    });
  }
}
