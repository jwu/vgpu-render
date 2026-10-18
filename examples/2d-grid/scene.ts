/**
 * `2d-grid`: width, cells, spacing, skew, outer edges, rotation and color.
 *
 * The 2D counterpart of the 3D grid page: `grid` now takes the same parameter set, with one
 * anticlockwise rotation around the centre and `outer` naming the x or y boundary lines.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACTION, FILL, RING, pageHeading, table2D } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-grid");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-grid");

  const widths = [1, 2, 4, 8] as const;
  const cells: readonly (readonly [number, number])[] = [[3, 3], [4, 3], [8, 6], [16, 9]];
  const spacings: readonly (readonly [number, number])[] = [[10, 10], [14, 10], [20, 12], [28, 14]];
  const skews: readonly (readonly [number, number])[] = [[0, 0], [0.28, 0], [-0.28, 0], [0.28, -0.18]];
  const outers = ["none", "x", "y", "xy"] as const;
  const rotations = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
  const colors: readonly Color[] = [FILL, [1, 0.85, 0.1, 0.35], ACTION, [0.25, 0.6, 1, 1]];

  const baseCells: readonly [number, number] = [4, 4];
  const baseSpacing: readonly [number, number] = [18, 14];
  const baseWidth = 2;

  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    // width
    d2.grid([columnX(0), y], baseCells, baseSpacing, { width: widths[row]!, color: RING, outer: "xy" });
    // cells
    d2.grid([columnX(1), y], cells[row]!, [10, 10], { width: baseWidth, color: RING, outer: "xy" });
    // spacing
    d2.grid([columnX(2), y], [4, 3], spacings[row]!, { width: baseWidth, color: RING, outer: "xy" });
    // skew
    d2.grid([columnX(3), y], baseCells, baseSpacing, { width: baseWidth, color: RING, skew: skews[row]!, outer: "xy" });
    // outer
    d2.grid([columnX(4), y], baseCells, baseSpacing, { width: baseWidth, color: RING, outer: outers[row]! });
    // rotation
    d2.grid([columnX(5), y], baseCells, baseSpacing, { width: baseWidth, color: RING, rotation: rotations[row]!, outer: "xy" });
    // color
    d2.grid([columnX(6), y], baseCells, baseSpacing, { width: baseWidth, color: colors[row]!, outer: "xy" });
  }
}
