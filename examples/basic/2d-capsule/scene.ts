/**
 * `2d-capsule`: normal length / radius / rotation / color / alpha, then the dashed outline and a
 * combined solid sample.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, table2D, withAlpha } from "../../shared/2d-page.js";

const LENGTHS = [0, 16, 32, 44] as const;
const RADII = [10, 14, 18, 22] as const;
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-capsule");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.capsule([shapeX(0), y], 18, LENGTHS[row], {
      strokeWidth: 2,
      color: RING,
    });
    d2.capsule([shapeX(1), y], RADII[row], 24, { strokeWidth: 2, color: RING });
    d2.capsule([shapeX(2), y], 14, 24, {
      rotation: ROTATIONS[row],
      strokeWidth: 2,
      color: WARM,
    });
    d2.capsule([shapeX(3), y], 18, 32, { strokeWidth: 2, color: COLORS[row] });
    d2.capsule([shapeX(4), y], 18, 32, {
      strokeWidth: 2,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.capsule_d([shapeX(5), y], 16, 28, [visible, gap, dashPhase], {
      strokeWidth: 2,
      color: COOL,
    });
    d2.capsule_s([shapeX(6), y], 18, LENGTHS[row], {
      rotation: ROTATIONS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
  }
}
