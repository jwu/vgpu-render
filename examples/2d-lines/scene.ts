/**
 * `2d-lines`: width, alpha, gradient, dash, open strip joints and closed loop joints.
 */

import type { Color, FrameDrawList, LineJoint } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { Vec2 } from "../../src/camera-2d.js";
import { ACCENT, ACTION, COOL, FILL, RING, WARM, pageHeading, table2D } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-lines");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-lines");
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
    const start = columnX(0) - 52;
    const end = columnX(0) + 58;
    d2.line([start, y], [end, y], { width: widths[row]!, color: FILL });
    d2.line([columnX(1) - 52, y], [columnX(1) + 58, y], {
      width: 9,
      color: [ACTION[0], ACTION[1], ACTION[2], alphas[row]!],
    });
    const [from, to] = gradients[row]!;
    d2.line([columnX(2) - 52, y], [columnX(2) + 58, y], { width: 7, color: from, colorEnd: to });
    const [dashVisible, dashGap] = dashes[row]!;
    d2.line([columnX(3) - 52, y], [columnX(3) + 58, y], {
      width: 7,
      dash: [dashVisible, dashGap, dashPhase],
      color: COOL,
    });

    const zigzag = (x: number): Vec2[] => [
      [x - 54, y + 22],
      [x - 27, y - 22],
      [x, y + 22],
      [x + 27, y - 22],
      [x + 54, y + 22],
    ];
    const loopPath = (x: number): Vec2[] => [
      [x - 50, y + 26],
      [x + 50, y + 26],
      [x + 50, y - 26],
      [x - 50, y - 26],
    ];

    d2.lineStrip(zigzag(columnX(4)), { width: 11, joint: joints[row]!, color: RING });
    d2.lineStrip(zigzag(columnX(5)), {
      width: 11,
      joint: joints[row]!,
      dash: [stripDash[0], stripDash[1], dashPhase],
      color: ACTION,
    });
    // Closed paths: the last point joins the first and the corner joints wrap around.
    d2.lineStrip(loopPath(columnX(6)), { width: 11, joint: joints[row]!, color: WARM }, true);
    d2.lineStrip(
      loopPath(columnX(7)),
      { width: 11, joint: joints[row]!, dash: [stripDash[0], stripDash[1], dashPhase], color: ACCENT },
      true,
    );
  }
}
