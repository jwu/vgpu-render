/**
 * `2d-rect`: normal width / size / rotation / color / alpha, then the dashed outline and a
 * combined solid sample (size, rotation, color and alpha together).
 */

import type { Vec2 } from "../../../src/camera-2d.js";
import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, ACTION, COOL, FILL, RING, WARM, table2D, withAlpha } from "../../shared/2d-page.js";

const WIDTHS = [1, 2, 4, 8] as const;
const SIZES: readonly Vec2[] = [[100, 48], [72, 44], [52, 60], [96, 32]];
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const ROTATED: Vec2 = [72, 32];
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_SIZES: readonly Vec2[] = [[92, 54], [68, 38], [92, 34], [68, 68]];
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASHED: Vec2 = [100, 46];
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-rect");
  const dashPhase = context.time * DASH_SPEED;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.rect([shapeX(0), y], [100, 46], { strokeWidth: WIDTHS[row], color: RING });
    d2.rect([shapeX(1), y], SIZES[row], { strokeWidth: 2, color: FILL });
    d2.rect([shapeX(2), y], ROTATED, {
      rotation: ROTATIONS[row],
      strokeWidth: 2,
      color: WARM,
    });
    d2.rect([shapeX(3), y], [100, 46], { strokeWidth: 2, color: COLORS[row] });
    d2.rect([shapeX(4), y], [100, 46], {
      strokeWidth: 2,
      color: withAlpha(COOL, ALPHAS[row]),
    });
    const [visible, gap] = DASHES[row];
    d2.rect_d([shapeX(5), y], DASHED, [visible, gap, dashPhase], {
      strokeWidth: 2,
      color: COOL,
    });
    d2.rect_s([shapeX(6), y], SOLID_SIZES[row], {
      rotation: ROTATIONS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
  }
}
