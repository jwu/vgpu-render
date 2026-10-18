/**
 * `text-layout`: what the layout can do, one row per capability.
 *
 * Every row is labelled on the left, and every bounded row draws the box it wrapped into: a wrapping
 * rule is unreadable without the box it wrapped against.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { LABEL, MARGIN, block, boundsBox, caption, heading, pixelRule } from "../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(drawList, "layout", "one row per capability · every bounded row draws the box it wrapped into");
  const textX = 196;
  const rowWidth = 250;
  let y = 72;

  caption(drawList, MARGIN, y + 8, "wrap · word");
  block(drawList, [textX, y], "alpha beta gamma delta epsilon", { fontSize: 14, bounds: [rowWidth, Number.POSITIVE_INFINITY], lineBreak: "word" });
  boundsBox(drawList, textX - 5, y - 5, rowWidth + 10, 40);
  y += 52;

  caption(drawList, MARGIN, y + 8, "wrap · character");
  block(drawList, [textX, y], "alpha beta gamma delta epsilon", { fontSize: 14, bounds: [rowWidth, Number.POSITIVE_INFINITY], lineBreak: "character" });
  boundsBox(drawList, textX - 5, y - 5, rowWidth + 10, 40);
  y += 58;

  caption(drawList, MARGIN, y + 8, "justify");
  for (const [index, justify] of (["left", "center", "right", "justified"] as const).entries()) {
    const x = textX + index * 152;
    caption(drawList, x, y, justify, LABEL, 11);
    block(drawList, [x, y + 16], "wrap me now", { fontSize: 14, justify, bounds: [124, Number.POSITIVE_INFINITY] });
  }
  y += 76;

  caption(drawList, MARGIN, y + 8, "line height");
  for (const [index, height] of [1.0, 2.0].entries()) {
    const x = textX + index * 220;
    caption(drawList, x, y, `${height} × font size`, LABEL, 11);
    block(drawList, [x, y + 16], "first\nsecond", { fontSize: 14, lineHeight: 14 * height });
  }
  y += 86;

  caption(drawList, MARGIN, y + 8, "letter spacing");
  for (const [index, spacing] of [0, 3].entries()) {
    const x = textX + index * 220;
    caption(drawList, x, y, `${spacing} px`, LABEL, 11);
    block(drawList, [x, y + 16], "spacing", { fontSize: 16, letterSpacing: spacing });
  }
  y += 60;

  caption(drawList, MARGIN, y + 8, "spans");
  block(
    drawList,
    [textX, y],
    [
      { text: "spans: " },
      { text: "red ", color: [1, 0.4, 0.4, 1] },
      { text: "green ", color: [0.45, 1, 0.55, 1] },
      { text: "BIG", color: [0.55, 0.8, 1, 1], fontSize: 30 },
    ],
    { fontSize: 16 },
  );
  y += 56;

  caption(drawList, MARGIN, y + 8, "anchor + bounds");
  block(drawList, [textX, y], "anchored box", { fontSize: 15, bounds: [130, Number.POSITIVE_INFINITY] });
  boundsBox(drawList, textX - 5, y - 5, 140, 28);

  pixelRule(drawList, MARGIN, y + 56);
}
