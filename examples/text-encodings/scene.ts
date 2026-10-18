/**
 * `text-encodings`: the same text from four sources.
 *
 * Two bands per column: the word at a normal size, and a shorter run of the same ink at more than
 * twice that, which is where a coverage source and a distance field stop looking alike. The outline
 * pair belongs on this page rather than its own: how a ring is obtained is a property of the encoding.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, HINT, MARGIN, TITLE, WORD, block, caption, heading, pixelRule } from "../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(
    drawList,
    "encodings",
    "one text, four sources · a column pins a source only when it says so; everything else takes the default, which rasterises each glyph at the size it covers on screen",
  );
  const columns: readonly (readonly [source: string, name: string, note: string])[] = [
    ["bitmap", "bitmap 1×", "coverage, one step per size"],
    ["sdf4x", "sdf 4×", "distance, 4 texels per px"],
    ["msdf2x", "msdf 2×", "per-edge distance, on demand"],
    ["baked", "msdf baked", "rebuilt from a 24 px page"],
  ];
  const columnWidth = 238;
  for (let index = 0; index < columns.length; index++) {
    const [source, name, note] = columns[index]!;
    const x = MARGIN + index * columnWidth;
    caption(drawList, x, 68, name, source === "baked" ? ACCENT : TITLE, 13);
    caption(drawList, x, 86, note, HINT, 11);
    block(drawList, [x, 104], WORD, { fontSize: 26, source });
    block(drawList, [x, 142], "Hand", { fontSize: 62, source });
  }

  caption(drawList, MARGIN, 240, "outline · width 3 font px, ring colour from the block");
  block(drawList, [MARGIN, 260], "outlined distance", { fontSize: 28, source: "sdf4x", outlineWidth: 3, outlineColor: [0.02, 0.03, 0.05, 1] });
  block(drawList, [MARGIN + 360, 260], "outlined mask", { fontSize: 28, source: "bitmap", outlineWidth: 3, outlineColor: [0.02, 0.03, 0.05, 1] });
  caption(drawList, MARGIN, 306, "a distance field reads the true distance alpha carries; a coverage mask is sampled in eight directions instead", HINT, 11);

  caption(drawList, MARGIN, 344, "one block per rung · 12 / 18 / 28 / 48 / 96 px");
  let x = MARGIN;
  for (const size of [12, 18, 28, 48, 96]) {
    block(drawList, [x, 362], "Hg", { fontSize: size });
    x += size * 1.55 + 20;
  }

  pixelRule(drawList, MARGIN, 500);
}
