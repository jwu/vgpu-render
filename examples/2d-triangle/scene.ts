/**
 * `2d-triangle`: normal vertices / rotation / stroke / color / alpha, then the dashed outline and
 * a combined solid sample.
 */

import type { Vec2 } from "../../src/camera-2d.js";
import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, table2D, withAlpha } from "../shared/2d-page.js";

type Triangle = readonly [Vec2, Vec2, Vec2];

const VERTICES: readonly Triangle[] = [
  [[0, 40], [-34, -20], [34, -20]],
  [[0, 38], [0, -20], [34, -20]],
  [[0, 38], [-36, -18], [30, -18]],
  [[0, 40], [-26, -20], [26, -20]],
];
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const STROKES = [1, 2, 4, 8] as const;
const COLORS = [WARM, ACCENT, COOL, ACTION] as const;
const ALPHAS = [0.25, 0.5, 0.75, 1] as const;
const SOLID_ALPHAS = [0.35, 0.6, 0.8, 1] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rows, rowY } = table2D(drawList, "2d-triangle");
  const dashPhase = context.time * DASH_SPEED;
  const at = (column: number, row: number, vertices: Triangle): [Vec2, Vec2, Vec2] => {
    const x = shapeX(column);
    const y = rowY(row);
    return [
      [x + vertices[0][0], y + vertices[0][1]],
      [x + vertices[1][0], y + vertices[1][1]],
      [x + vertices[2][0], y + vertices[2][1]],
    ];
  };
  for (let row = 0; row < rows; row++) {
    const [va, vb, vc] = at(0, row, VERTICES[row]);
    d2.triangle(va, vb, vc, { strokeWidth: 2, color: RING });

    const [ra, rb, rc] = at(1, row, VERTICES[0]);
    d2.triangle(ra, rb, rc, { rotation: ROTATIONS[row], strokeWidth: 2, color: WARM });

    const [sa, sb, sc] = at(2, row, VERTICES[0]);
    d2.triangle(sa, sb, sc, { strokeWidth: STROKES[row], color: RING });

    const [ca, cb, cc] = at(3, row, VERTICES[0]);
    d2.triangle(ca, cb, cc, { strokeWidth: 2, color: COLORS[row] });

    const [aa, ab, ac] = at(4, row, VERTICES[0]);
    d2.triangle(aa, ab, ac, { strokeWidth: 2, color: withAlpha(COOL, ALPHAS[row]) });

    const [da, db, dc] = at(5, row, VERTICES[0]);
    const [visible, gap] = DASHES[row];
    d2.triangle_d(da, db, dc, [visible, gap, dashPhase], { strokeWidth: 2, color: COOL });

    const [fa, fb, fc] = at(6, row, VERTICES[row]);
    d2.triangle_s(fa, fb, fc, {
      rotation: ROTATIONS[row],
      color: withAlpha(COLORS[row], SOLID_ALPHAS[row]),
    });
  }
}
