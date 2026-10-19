/**
 * `2d-order`: the `zIndex` layering key, shared by 2D primitives and text.
 *
 * All three columns draw the same two things — an opaque rectangle and a label — and differ only
 * in their keys. That is the whole contract: nothing here writes the depth buffer, so a higher key
 * simply draws later and covers a lower one. The third column adds a translucent rectangle on top
 * of both, which shows a label sitting between two shapes rather than above or below the pair.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, COOL, FILL, RING, TITLE, table2D, withAlpha } from "../shared/2d-page.js";

const RECT: readonly [number, number] = [104, 60];
const LABEL_FONT = 24;

/** One opaque rectangle at `zIndex`, with the test label at another. */
function shapeAndLabel(
  drawList: FrameDrawList,
  d2: ReturnType<typeof table2D>["d2"],
  x: number,
  y: number,
  rectKey: number,
  textKey: number,
  color: readonly [number, number, number, number],
): void {
  d2.rect_s([x, y], RECT, { color, zIndex: rectKey });
  drawList.text([x, y, 0], "LABEL", {
    space: "world-plane",
    pixelSize: 1,
    fontSize: LABEL_FONT,
    color: TITLE,
    zIndex: textKey,
  });
}

export function draw(drawList: FrameDrawList, _context: SceneContext): void {
  const { d2, shapeX, rowY } = table2D(drawList, "2d-order");
  const y = rowY(0);

  // Column 0: the rectangle is drawn second, so it hides the label.
  shapeAndLabel(drawList, d2, shapeX(0), y, 1, 0, RING);

  // Column 1: the same two commands with the keys swapped — now the label covers the rectangle.
  shapeAndLabel(drawList, d2, shapeX(1), y, 0, 1, COOL);

  // Column 2: a base rectangle, the label over it, then a translucent rectangle over both.
  const x = shapeX(2);
  d2.rect_s([x, y], RECT, { color: withAlpha(COOL, 1), zIndex: 0 });
  drawList.text([x, y, 0], "LABEL", {
    space: "world-plane",
    pixelSize: 1,
    fontSize: LABEL_FONT,
    color: TITLE,
    zIndex: 1,
  });
  d2.rect_s([x, y + RECT[1] * 0.25], [RECT[0], RECT[1] * 0.5], { color: withAlpha(ACCENT, 0.72), zIndex: 2 });

  // A hint in the free space under the matrix: the key is never depth, it is draw order.
  drawList.text([0, rowY(0) - 96, 0], "higher zIndex → drawn later → covers lower", {
    space: "world-plane",
    pixelSize: 1,
    fontSize: 17,
    color: withAlpha(FILL, 0.62),
    zIndex: 8,
  });
}
