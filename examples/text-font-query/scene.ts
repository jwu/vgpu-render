/**
 * `text-font-query`: weight, width and style, the three axes bevy's `font-query` example queries.
 *
 * The page draws with a family built for it rather than with the bundled debug face, because the
 * axes are only worth showing where they can act:
 *
 * - The family is eight static instances of one variable font, registered as faces of the same family
 *   with their own `weight` descriptors. Canvas2D picks a face by that descriptor, so 200 to 900 are
 *   eight real weights rather than one synthesised bold step.
 * - `width` cannot act: the instanced faces carry no `wdth` axis, and Canvas2D drops a
 *   `font-stretch` keyword when the face has none.
 * - `style` is synthesised: the instances carry no italic, so the browser slants them itself.
 *
 * The span row at the bottom is the part bevy's example does not cover: a span overrides one axis of
 * the block's face rather than replacing the whole face.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { TEXT_FONT_WIDTHS, type TextFontStyle } from "../../src/text-layout.js";
import { MULTI_WEIGHT_SANS_FAMILY } from "../shared/font-families.js";
import { HINT, LABEL, MARGIN, block, caption, heading, pixelRule } from "../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const sans = MULTI_WEIGHT_SANS_FAMILY;
  heading(
    drawList,
    "font faces",
    "weight, width and style · eight weights instanced from one variable font · width needs a wdth axis these faces lack",
  );

  const weights: readonly (readonly [string, number])[] = [
    ["Weight 200 (Extra Light)", 200],
    ["Weight 300 (Light)", 300],
    ["Weight 400 (Normal)", 400],
    ["Weight 500 (Medium)", 500],
    ["Weight 600 (Semibold)", 600],
    ["Weight 700 (Bold)", 700],
    ["Weight 800 (Extra Bold)", 800],
    ["Weight 900 (Black)", 900],
  ];
  const styles: readonly (readonly [string, TextFontStyle])[] = [
    ["FontStyle::Normal", "normal"],
    ["FontStyle::Italic", "italic"],
  ];

  // Sample size and column pitch are tied: the widest label is `FontWidth::EXTRA_CONDENSED`, so a
  // larger size has to widen every column with it or the three columns collide. Captions stay a step
  // smaller than the samples so the labels read as annotations.
  const sampleSize = 18;
  const captionSize = 14;
  const noteSize = 12;
  const weightX = MARGIN;
  const widthX = weightX + 289;
  const styleX = widthX + 311;
  const captionY = 68;
  const noteY = 88;
  const firstRowY = 116;
  const rowStep = 30;

  caption(drawList, weightX, captionY, "weight · 200 … 900", LABEL, captionSize);
  caption(drawList, weightX, noteY, "eight real faces, no synthesis", HINT, noteSize);
  caption(drawList, widthX, captionY, "width · nine font-stretch stops", LABEL, captionSize);
  caption(drawList, widthX, noteY, "inert · no wdth axis on these faces", HINT, noteSize);
  caption(drawList, styleX, captionY, "style", LABEL, captionSize);
  caption(drawList, styleX, noteY, "italic is slanted by the browser", HINT, noteSize);

  for (const [index, [label, weight]] of weights.entries()) {
    block(drawList, [weightX, firstRowY + index * rowStep], label, { fontSize: sampleSize, fontFamily: sans, weight });
  }

  for (const [index, width] of TEXT_FONT_WIDTHS.entries()) {
    // The label names the stop; the ink beside it is the same at every stop on these faces.
    block(drawList, [widthX, firstRowY + index * rowStep], `FontWidth::${width.toUpperCase().replaceAll("-", "_")}`, {
      fontSize: sampleSize,
      fontFamily: sans,
      width,
    });
  }

  for (const [index, [label, style]] of styles.entries()) {
    block(drawList, [styleX, firstRowY + index * rowStep], label, { fontSize: sampleSize, fontFamily: sans, style });
  }

  // The width column lists nine stops while weight lists eight, so the span row clears the longer one.
  const spanY = firstRowY + Math.max(weights.length, TEXT_FONT_WIDTHS.length) * rowStep + 12;
  caption(drawList, MARGIN, spanY, "spans · one axis each, the rest inherited from the block", LABEL, captionSize);
  block(
    drawList,
    [MARGIN, spanY + 26],
    [
      { text: "regular, " },
      { text: "bold, ", weight: 700 },
      { text: "bold italic,", weight: 700, style: "italic" },
      { text: " light", weight: 200 },
    ],
    { fontSize: 24, fontFamily: sans },
  );

  pixelRule(drawList, MARGIN, spanY + 96);
}
