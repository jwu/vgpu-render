/**
 * `2d-grid`: the grid primitive — cell count per column, line width per row, one fixed extent.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { Vec2 } from "../../src/camera-2d.js";
import { RING, pageHeading, table2D } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-grid");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-grid");
  const cells: readonly (readonly [number, number])[] = [
    [2, 2],
    [4, 3],
    [8, 6],
    [16, 9],
  ];
  const widths = [1, 2, 4] as const;
  const extent: Vec2 = [132, 84];
  for (let column = 0; column < cells.length; column++) {
    const [columns, lines] = cells[column]!;
    for (let row = 0; row < rows; row++) {
      d2.grid([columnX(column), rowY(row)], [columns, lines], [extent[0] / columns, extent[1] / lines], {
        width: widths[row]!,
        color: RING,
      });
    }
  }
}
