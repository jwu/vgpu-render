/**
 * `2d-lines`: width, alpha, gradient, dash, open strip joints and closed loop joints.
 */

import type { Color, FrameDrawList, LineJoint } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { Vec2 } from "../../src/camera-2d.js";
import { ACCENT, ACTION, COOL, FILL, RING, WARM, table2D } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const { d2, shapeX, rowY, rows } = table2D(drawList, "2d-lines");
  const widths = [2, 6, 12, 24] as const;
  const alphas = [0.25, 0.5, 0.75, 1] as const;
  const gradients: readonly (readonly [Color, Color])[] = [
    [ACTION, RING],
    [COOL, WARM],
    [ACCENT, COOL],
    [WARM, ACTION],
  ];
  const dashes: readonly (readonly [number, number, number])[] = [
    [24, 8, 0],
    [12, 12, 6],
    [6, 18, 0],
    [2, 12, 0],
  ];
  const joints: readonly LineJoint[] = ["none", "round", "bevel", "miter"];
  // The phase travels with time so the pattern visibly moves along the path, the same convention
  // as the 3D line page; 30 px/s makes one 24/14 period take just over a second.
  const dashPhase = context.time * 30;
  const stripDash = [24, 14] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const start = shapeX(0) - 40;
    const end = shapeX(0) + 40;
    d2.line([start, y], [end, y], { width: widths[row]!, color: FILL });
    d2.line([shapeX(1) - 40, y], [shapeX(1) + 40, y], {
      width: 9,
      color: [ACTION[0], ACTION[1], ACTION[2], alphas[row]!],
    });
    const [from, to] = gradients[row]!;
    d2.line([shapeX(2) - 40, y], [shapeX(2) + 40, y], { width: 7, color: from, colorEnd: to });
    const [dashVisible, dashGap] = dashes[row]!;
    d2.line_d([shapeX(3) - 40, y], [shapeX(3) + 40, y], [dashVisible, dashGap, dashPhase], {
      width: 7,
      color: COOL,
    });

    const zigzag = (x: number): Vec2[] => [
      [x - 42, y + 20],
      [x - 21, y - 20],
      [x, y + 20],
      [x + 21, y - 20],
      [x + 42, y + 20],
    ];
    const loopPath = (x: number): Vec2[] => [
      [x - 40, y + 22],
      [x + 40, y + 22],
      [x + 40, y - 22],
      [x - 40, y - 22],
    ];

    d2.lineStrip(zigzag(shapeX(4)), { width: 11, joint: joints[row]!, color: RING });
    d2.lineStrip_d(zigzag(shapeX(5)), [stripDash[0], stripDash[1], dashPhase], {
      width: 11,
      joint: joints[row]!,
      color: ACTION,
    });
    // Closed paths: the last point joins the first and the corner joints wrap around.
    d2.lineLoop(loopPath(shapeX(6)), { width: 11, joint: joints[row]!, color: WARM });
    d2.lineLoop_d(loopPath(shapeX(7)), [stripDash[0], stripDash[1], dashPhase], {
      width: 11,
      joint: joints[row]!,
      color: ACCENT,
    });
  }
}
