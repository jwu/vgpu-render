/**
 * `2d-rounded-rect`: normal radius / size / rotation / color / alpha, then the dashed outline, a
 * combined solid sample and a hatched fill.
 */

import type { Vec2 } from "../../../src/camera-2d.js";
import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, FILL, RING, WARM, hatchSample, table2D, withAlpha } from "../../shared/2d-page.js";

const RADII = [2, 12, 24, 40] as const;
const SIZES: readonly Vec2[] = [[100, 52], [72, 44], [52, 60], [96, 32]];
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const ROTATED: Vec2 = [72, 32];
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_SIZES: readonly Vec2[] = [[92, 52], [64, 44], [84, 42], [68, 68]];
const SOLID_RADII = [16, 20, 24, 28] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-rounded-rect");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.rect_r([shapeX(0), y], [100, 52], RADII[row], {
      strokeWidth: 2,
      color: RING,
    });
    d2.rect_r([shapeX(1), y], SIZES[row], 24, { strokeWidth: 2, color: FILL });
    d2.rect_r([shapeX(2), y], ROTATED, 16, {
      rotation: ROTATIONS[row],
      strokeWidth: 2,
      color: WARM,
    });
    d2.rect_r([shapeX(3), y], [100, 52], 24, {
      strokeWidth: 2,
      color: COLORS[row],
    });
    d2.rect_r([shapeX(4), y], [100, 52], 24, {
      strokeWidth: 2,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.rect_r_d([shapeX(5), y], [100, 52], 24, [visible, gap, dashPhase], {
      strokeWidth: 2,
      color: COOL,
    });
    d2.rect_r_s([shapeX(6), y], SOLID_SIZES[row], SOLID_RADII[row], {
      rotation: ROTATIONS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
    d2.rect_r_h([shapeX(7), y], SOLID_SIZES[row], SOLID_RADII[row], {
      rotation: ROTATIONS[row],
      hatch: hatchSample(row, dashPhase),
      color: COLORS[row],
    });
  }
}
