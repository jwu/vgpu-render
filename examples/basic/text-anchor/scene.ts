/**
 * `text-anchor`: the nine anchors against the marker they land on.
 *
 * The `+` marks the position the block is given and the box is the block's own bounds, so both of the
 * things an anchor moves between are visible at once. Captions sit above the cell rather than beside
 * the box, which is what keeps them from being drawn over.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ACCENT, LABEL, MARGIN, block, boundsBox, caption, heading, pixelRule } from "../../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(drawList, "anchors", "the plus is the position the block is given · the box is the block's bounds · the caption names the anchor");
  const anchors = [
    ["top-left", "top-center", "top-right"],
    ["center-left", "center", "center-right"],
    ["bottom-left", "bottom-center", "bottom-right"],
  ] as const;

  const columnStep = 240;
  const rowStep = 128;
  const width = 108;
  const height = 28;
  for (let row = 0; row < anchors.length; row++) {
    for (let column = 0; column < anchors[row]!.length; column++) {
      const anchor = anchors[row]![column]!;
      const x = 122 + column * columnStep;
      const y = 158 + row * rowStep;
      caption(drawList, x - 54, y - 102, anchor, LABEL, 11);
      drawList.point([x, y, 0], { color: ACCENT, size: 7, sizeMode: "screen", layer: 0 });
      drawList.text([x, y, 0], "+", { fontSize: 18, space: "screen", anchor: "center", color: ACCENT });
      block(drawList, [x, y], "anchor box", { fontSize: 15, anchor, bounds: [width, Number.POSITIVE_INFINITY] });
      const originX = anchor.endsWith("left") ? x : anchor.endsWith("right") ? x - width : x - width / 2;
      const originY = anchor.startsWith("top") ? y : anchor.startsWith("bottom") ? y - height : y - height / 2;
      boundsBox(drawList, originX - 4, originY - 4, width + 8, height + 8);
    }
  }

  pixelRule(drawList, MARGIN, 520);
}
