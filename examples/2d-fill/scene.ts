/**
 * `2d-fill`: shape parameters as rows — rotation, sweep, side count, capsule length.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, ACTION, COOL, FILL, RING, WARM, pageHeading, table2D } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-fill");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-fill");
  const rotations = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
  const sweeps = [Math.PI / 3, (Math.PI * 2) / 3, (Math.PI * 4) / 3, (Math.PI * 11) / 6] as const;
  const sides = [3, 4, 6, 12] as const;
  const lengths = [0, 18, 36, 54] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.rect([columnX(0), y], [110, 70], { rotation: rotations[row]!, color: WARM });
    d2.ellipse([columnX(1), y], [66, 34], { rotation: rotations[row]!, color: ACCENT });
    d2.sector([columnX(2), y], 50, {
      startAngle: -Math.PI / 2,
      sweep: sweeps[row]!,
      color: COOL,
    });
    d2.segment([columnX(3), y], 50, {
      startAngle: -Math.PI / 2,
      sweep: sweeps[row]!,
      color: RING,
    });
    d2.polygon([columnX(4), y], 50, sides[row]!, { color: ACTION });
    d2.capsule([columnX(5), y], 22, lengths[row]!, { color: FILL });
  }
}
