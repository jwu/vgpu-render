/**
 * `text-cjk`: wrapping and kinsoku, which no latin page can show.
 *
 * CJK has no spaces to break at, so the wrap is per character, and kinsoku is what keeps a closing
 * mark off the start of a line and an opening bracket off its end.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { MARGIN, block, boundsBox, caption, heading, pixelRule } from "../../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(drawList, "cjk", "no spaces to break at, so the wrap is per character · kinsoku keeps a closing mark off a line start and an opening bracket off a line end");
  const paragraph = "中文排版按字符换行，行首不留标点，行尾不留开括号（像这样）。中英混排 mixed with latin words 也要能正常断行。";

  caption(drawList, MARGIN, 74, "wrapped to 300 px");
  block(drawList, [MARGIN, 92], paragraph, { fontSize: 18, bounds: [300, Number.POSITIVE_INFINITY] });
  boundsBox(drawList, MARGIN - 5, 87, 310, 108);

  caption(drawList, 404, 74, "wrapped to 150 px · narrow enough that kinsoku has to act");
  block(drawList, [404, 92], paragraph, { fontSize: 18, bounds: [150, Number.POSITIVE_INFINITY] });
  boundsBox(drawList, 399, 87, 160, 236);

  caption(drawList, MARGIN, 344, "sizes · the ladder follows the screen, so no size has to be baked ahead");
  let y = 366;
  for (const size of [12, 18, 28, 48]) {
    caption(drawList, MARGIN, y + size * 0.42, `${size} px`);
    block(drawList, [MARGIN + 74, y], "中文排版与字号", { fontSize: size });
    y += Math.max(size * 1.45, 26);
  }

  pixelRule(drawList, MARGIN, y + 14);
}
