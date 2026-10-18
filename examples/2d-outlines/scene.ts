/**
 * `2d-outlines`: the same six shapes stroked with four widths.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { RING, pageHeading, table2D } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-outlines");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-outlines");
  const widths = [2, 4, 8, 16] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const style = { fill: false, strokeWidth: widths[row]!, color: RING };
    d2.rect([columnX(0), y], [110, 70], style);
    d2.roundedRect([columnX(1), y], [110, 70], 24, style);
    d2.circle([columnX(2), y], 48, style);
    d2.ellipse([columnX(3), y], [56, 36], style);
    d2.annulus([columnX(4), y], 22, 48, style);
    d2.polygon([columnX(5), y], 48, 6, style);
  }
}
