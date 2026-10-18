/**
 * `text-scale`: three raster strategies at one size, then one size per row.
 *
 * The top row is the comparison the screen-driven ladder exists for: the same 26 px text under the
 * ladder, a fixed 1× raster and a fixed 4× raster. Below it the sizes run from 8 px to 96 px, so the
 * rung changes — and the absence of a soft step between them — are visible in one frame.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, LABEL, MARGIN, WORD, block, caption, heading, pixelRule } from "../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(
    drawList,
    "scale",
    "one text, six sizes · the top row pins three raster strategies at 26 px · the first column is what a caller gets by default",
  );

  const pinned: readonly (readonly [label: string, source: string | undefined])[] = [
    ["ladder · screen decides", undefined],
    ["fixed 1× raster", "bitmap"],
    ["fixed 4× raster", "bitmap4x"],
  ];
  for (let index = 0; index < pinned.length; index++) {
    const [label, source] = pinned[index]!;
    const x = MARGIN + index * 326;
    caption(drawList, x, 66, label, index === 0 ? ACCENT : LABEL, 13);
    block(drawList, [x, 86], WORD, { fontSize: 26, ...(source === undefined ? {} : { source }) });
  }

  caption(drawList, MARGIN, 140, "one size per row · the label is the requested size in screen pixels");
  let y = 162;
  for (const size of [8, 12, 18, 28, 48, 96]) {
    const text = size <= 28 ? "Hamburgefonstiv 0123" : size === 48 ? "Hamburg" : "Abc";
    caption(drawList, MARGIN, y + size * 0.42, `${size} px`);
    block(drawList, [MARGIN + 74, y], text, { fontSize: size });
    y += Math.max(size * 1.45, 28);
  }

  pixelRule(drawList, MARGIN, y + 14);
}
