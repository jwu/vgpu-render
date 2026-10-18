/**
 * Screen-space text pages.
 *
 * These are vgpu's own capability rather than a port — the reference addon has no text API — so they
 * are organised as **one page per question**:
 *
 * - `text-encodings` — the same text from every glyph source, at two sizes, plus the outline pair.
 * - `text-scale` — the same sentence at six sizes, over three raster strategies at one size.
 * - `text-world-zoom` — world-space rows meant to be magnified with the camera, which is the only way
 *   to see what a source does once a block outgrows the raster its glyphs were built at.
 * - `text-layout` — wrapping, justification, bounds, line height, letter spacing and spans.
 * - `text-anchor` — the nine anchors against the marker they land on and their own bounds.
 * - `text-cjk` — CJK wrapping, kinsoku and mixed-script runs.
 * - `text-font-query` — weight, width and style, with what the browser can actually honour.
 *
 * Three conventions run through all of them, because a comparison without them is unreadable:
 *
 * 1. **One sentence, repeated per condition**, with the condition labelled above the column. A page
 *    whose rows each say something different cannot be compared at all.
 * 2. **Every caption stays inside the width of its column**, which is the mistake this layout makes
 *    first: overlapping captions are worse than a shorter label.
 * 3. **A 1 px rule** in the bottom-left corner of every screen-space page, so an edge has something of
 *    a known width next to it. It is drawn with one-pixel **points**, because `recorder.line` has no
 *    screen-space mode: a line is a world-space segment projected through the camera, which lands as
 *    an arbitrary diagonal on a page whose content is in pixels.
 *
 * Text blocks deliberately name no glyph source: they take the default one, which rasterises each
 * glyph at the size it covers on screen. That is what a caller gets out of the box, and the thing
 * these pages exist to show; a block that wants a fixed raster says so explicitly.
 *
 * A page that mixes screen-space captions with world-space content cannot work: the camera is framed
 * around every command's position, so a caption at `[24, 520]` drags the viewport to those world
 * coordinates and the real content ends up off-screen. `text-world-zoom` is therefore world-space end
 * to end, captions included.
 */

import { TEXT_FONT_WIDTHS, type TextFontStyle } from "./text-layout.js";
import { MULTI_WEIGHT_SANS_FAMILY } from "./font-families.js";
import type { Color, FrameRecorder, TextOptions, TextSpanOptions } from "./frame-recorder.js";

const LABEL: Color = [0.62, 0.68, 0.78, 1];
const TITLE: Color = [0.92, 0.95, 1, 1];
const INK: Color = [0.93, 0.95, 0.98, 1];
const ACCENT: Color = [1, 0.85, 0.35, 1];
const FRAME: Color = [0.52, 0.6, 0.72, 1];
const HINT: Color = [0.55, 0.62, 0.72, 1];

/** The sentence every page repeats, chosen for its straights, round bowls and diagonal. */
const SENTENCE = "Handgloves 0123";
/** The first word alone, for columns that cannot afford the whole sentence. */
const WORD = "Handgloves";

const MARGIN = 24;

/** A page heading plus its one-line explanation. */
function heading(recorder: FrameRecorder, title: string, note: string): void {
  recorder.text([MARGIN, 16, 0], title, { fontSize: 17, space: "screen", anchor: "top-left", color: TITLE });
  recorder.text([MARGIN, 38, 0], note, { fontSize: 12, space: "screen", anchor: "top-left", color: HINT });
}

/** A column caption: what condition this column shows, with an optional second line. */
function caption(recorder: FrameRecorder, x: number, y: number, text: string, color: Color = LABEL, size = 12): void {
  recorder.text([x, y, 0], text, { fontSize: size, space: "screen", anchor: "top-left", color });
}

/**
 * A 1 px ruler, drawn with screen-space points.
 *
 * `recorder.line` has no screen-space mode: a line is always a segment in the world, projected through
 * whatever camera is looking, so a "pixel" line drawn with it lands as an arbitrary diagonal. Until
 * there is a screen-space line, one-pixel points are the only primitive that lands on the pixel grid.
 */
function pixelLine(recorder: FrameRecorder, from: readonly [number, number], to: readonly [number, number], color: Color): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    recorder.point([from[0] + dx * t, from[1] + dy * t, 0], { color, size: 1, sizeMode: "screen", round: false, layer: 0 });
  }
}

/** The 1 px rule that gives a page a width reference. */
function pixelRule(recorder: FrameRecorder, x: number, y: number): void {
  caption(recorder, x, y - 15, "1 px");
  pixelLine(recorder, [x, y], [x + 48, y], [0.75, 0.8, 0.9, 1]);
}

/** A one-pixel rectangle outline, in the top-left pixel convention the layout speaks. */
function boundsBox(recorder: FrameRecorder, x: number, y: number, width: number, height: number, color: Color = FRAME): void {
  const corners: readonly (readonly [number, number])[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  for (let index = 0; index < corners.length; index++) {
    pixelLine(recorder, corners[index]!, corners[(index + 1) % corners.length]!, color);
  }
}

/** Screen-space text that names no source, so it moves with the gallery's source selection. */
function block(
  recorder: FrameRecorder,
  position: readonly [number, number],
  text: string | readonly TextSpanOptions[],
  options: TextOptions,
): void {
  recorder.text([position[0], position[1], 0], text, { space: "screen", anchor: "top-left", color: INK, ...options });
}

/**
 * `text-encodings` — the same text from four sources.
 *
 * Two bands per column: the word at a normal size, and a shorter run of the same ink at more than
 * twice that, which is where a coverage source and a distance field stop looking alike. The outline
 * pair belongs on this page rather than its own: how a ring is obtained is a property of the encoding.
 */
export function textEncodingsScene(recorder: FrameRecorder): void {
  heading(
    recorder,
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
    caption(recorder, x, 68, name, source === "baked" ? ACCENT : TITLE, 13);
    caption(recorder, x, 86, note, HINT, 11);
    block(recorder, [x, 104], WORD, { fontSize: 26, source });
    block(recorder, [x, 142], "Hand", { fontSize: 62, source });
  }

  caption(recorder, MARGIN, 240, "outline · width 3 font px, ring colour from the block");
  block(recorder, [MARGIN, 260], "outlined distance", { fontSize: 28, source: "sdf4x", outlineWidth: 3, outlineColor: [0.02, 0.03, 0.05, 1] });
  block(recorder, [MARGIN + 360, 260], "outlined mask", { fontSize: 28, source: "bitmap", outlineWidth: 3, outlineColor: [0.02, 0.03, 0.05, 1] });
  caption(recorder, MARGIN, 306, "a distance field reads the true distance alpha carries; a coverage mask is sampled in eight directions instead", HINT, 11);

  caption(recorder, MARGIN, 344, "one block per rung · 12 / 18 / 28 / 48 / 96 px");
  let x = MARGIN;
  for (const size of [12, 18, 28, 48, 96]) {
    block(recorder, [x, 362], "Hg", { fontSize: size });
    x += size * 1.55 + 20;
  }

  pixelRule(recorder, MARGIN, 500);
}

/**
 * `text-scale` — three raster strategies at one size, then one size per row.
 *
 * The top row is the comparison the screen-driven ladder exists for: the same 26 px text under the
 * ladder, a fixed 1× raster and a fixed 4× raster. Below it the sizes run from 8 px to 96 px, so the
 * rung changes — and the absence of a soft step between them — are visible in one frame.
 */
export function textScaleScene(recorder: FrameRecorder): void {
  heading(
    recorder,
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
    caption(recorder, x, 66, label, index === 0 ? ACCENT : LABEL, 13);
    block(recorder, [x, 86], WORD, { fontSize: 26, ...(source === undefined ? {} : { source }) });
  }

  caption(recorder, MARGIN, 140, "one size per row · the label is the requested size in screen pixels");
  let y = 162;
  for (const size of [8, 12, 18, 28, 48, 96]) {
    const text = size <= 28 ? "Hamburgefonstiv 0123" : size === 48 ? "Hamburg" : "Abc";
    caption(recorder, MARGIN, y + size * 0.42, `${size} px`);
    block(recorder, [MARGIN + 74, y], text, { fontSize: size });
    y += Math.max(size * 1.45, 28);
  }

  pixelRule(recorder, MARGIN, y + 14);
}

/**
 * `text-world-zoom` — rows meant to be magnified.
 *
 * Screen-space text cannot be magnified: its pixel size is fixed, so a bigger block is simply a
 * request for a new rasterisation. World-space text is where the camera does the magnifying, which is
 * the only honest test of what a raster does past its own size — a coverage source runs into the
 * texels it stored, a distance field keeps rebuilding the edge from them. The whole page is world
 * space, captions included, so the framing sees one coordinate system.
 */
export function textWorldZoomScene(recorder: FrameRecorder): void {
  const rows: readonly (readonly [source: string, label: string])[] = [
    ["bitmap", "bitmap 1×"],
    ["bitmap4x", "bitmap 4×"],
    ["sdf4x", "sdf 4×"],
    ["baked", "msdf baked"],
  ];
  const pixelSize = 0.02;
  for (let index = 0; index < rows.length; index++) {
    const [source, label] = rows[index]!;
    // Above `y = 0` with room to spare: the grid writes depth, so a row that dips below the plane
    // gets clipped along its lines. The lowest row's ink box still starts well above it.
    const y = 3.6 - index * 0.9;
    recorder.text([-2.05, y, 0], label, {
      fontSize: 12,
      pixelSize: 0.012,
      space: "world-billboard",
      anchor: "center-right",
      color: index === 2 ? ACCENT : LABEL,
    });
    recorder.text([-1.95, y, 0], WORD, {
      fontSize: 30,
      pixelSize,
      space: "world-billboard",
      anchor: "center-left",
      color: INK,
      source,
    });
  }

  recorder.text([-1.95, 0.15, 0], "scroll to magnify", {
    fontSize: 13,
    pixelSize: 0.012,
    space: "world-billboard",
    anchor: "top-left",
    color: HINT,
  });
}

/**
 * `text-layout` — what the layout can do, one row per capability.
 *
 * Every row is labelled on the left, and every bounded row draws the box it wrapped into: a wrapping
 * rule is unreadable without the box it wrapped against.
 */
export function textLayoutScene(recorder: FrameRecorder): void {
  heading(recorder, "layout", "one row per capability · every bounded row draws the box it wrapped into");
  const textX = 196;
  const rowWidth = 250;
  let y = 72;

  caption(recorder, MARGIN, y + 8, "wrap · word");
  block(recorder, [textX, y], "alpha beta gamma delta epsilon", { fontSize: 14, bounds: [rowWidth, Number.POSITIVE_INFINITY], lineBreak: "word" });
  boundsBox(recorder, textX - 5, y - 5, rowWidth + 10, 40);
  y += 52;

  caption(recorder, MARGIN, y + 8, "wrap · character");
  block(recorder, [textX, y], "alpha beta gamma delta epsilon", { fontSize: 14, bounds: [rowWidth, Number.POSITIVE_INFINITY], lineBreak: "character" });
  boundsBox(recorder, textX - 5, y - 5, rowWidth + 10, 40);
  y += 58;

  caption(recorder, MARGIN, y + 8, "justify");
  for (const [index, justify] of (["left", "center", "right", "justified"] as const).entries()) {
    const x = textX + index * 152;
    caption(recorder, x, y, justify, LABEL, 11);
    block(recorder, [x, y + 16], "wrap me now", { fontSize: 14, justify, bounds: [124, Number.POSITIVE_INFINITY] });
  }
  y += 76;

  caption(recorder, MARGIN, y + 8, "line height");
  for (const [index, height] of [1.0, 2.0].entries()) {
    const x = textX + index * 220;
    caption(recorder, x, y, `${height} × font size`, LABEL, 11);
    block(recorder, [x, y + 16], "first\nsecond", { fontSize: 14, lineHeight: 14 * height });
  }
  y += 86;

  caption(recorder, MARGIN, y + 8, "letter spacing");
  for (const [index, spacing] of [0, 3].entries()) {
    const x = textX + index * 220;
    caption(recorder, x, y, `${spacing} px`, LABEL, 11);
    block(recorder, [x, y + 16], "spacing", { fontSize: 16, letterSpacing: spacing });
  }
  y += 60;

  caption(recorder, MARGIN, y + 8, "spans");
  block(
    recorder,
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

  caption(recorder, MARGIN, y + 8, "anchor + bounds");
  block(recorder, [textX, y], "anchored box", { fontSize: 15, bounds: [130, Number.POSITIVE_INFINITY] });
  boundsBox(recorder, textX - 5, y - 5, 140, 28);

  pixelRule(recorder, MARGIN, y + 56);
}

/**
 * `text-anchor` — the nine anchors against the marker they land on.
 *
 * The `+` marks the position the block is given and the box is the block's own bounds, so both of the
 * things an anchor moves between are visible at once. Captions sit above the cell rather than beside
 * the box, which is what keeps them from being drawn over.
 */
export function textAnchorScene(recorder: FrameRecorder): void {
  heading(recorder, "anchors", "the plus is the position the block is given · the box is the block's bounds · the caption names the anchor");
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
      caption(recorder, x - 54, y - 102, anchor, LABEL, 11);
      recorder.point([x, y, 0], { color: ACCENT, size: 7, sizeMode: "screen", layer: 0 });
      recorder.text([x, y, 0], "+", { fontSize: 18, space: "screen", anchor: "center", color: ACCENT });
      block(recorder, [x, y], "anchor box", { fontSize: 15, anchor, bounds: [width, Number.POSITIVE_INFINITY] });
      const originX = anchor.endsWith("left") ? x : anchor.endsWith("right") ? x - width : x - width / 2;
      const originY = anchor.startsWith("top") ? y : anchor.startsWith("bottom") ? y - height : y - height / 2;
      boundsBox(recorder, originX - 4, originY - 4, width + 8, height + 8);
    }
  }

  pixelRule(recorder, MARGIN, 520);
}

/**
 * `text-cjk` — wrapping and kinsoku, which no latin page can show.
 *
 * CJK has no spaces to break at, so the wrap is per character, and kinsoku is what keeps a closing
 * mark off the start of a line and an opening bracket off its end.
 */
export function textCjkScene(recorder: FrameRecorder): void {
  heading(recorder, "cjk", "no spaces to break at, so the wrap is per character · kinsoku keeps a closing mark off a line start and an opening bracket off a line end");
  const paragraph = "中文排版按字符换行，行首不留标点，行尾不留开括号（像这样）。中英混排 mixed with latin words 也要能正常断行。";

  caption(recorder, MARGIN, 74, "wrapped to 300 px");
  block(recorder, [MARGIN, 92], paragraph, { fontSize: 18, bounds: [300, Number.POSITIVE_INFINITY] });
  boundsBox(recorder, MARGIN - 5, 87, 310, 108);

  caption(recorder, 404, 74, "wrapped to 150 px · narrow enough that kinsoku has to act");
  block(recorder, [404, 92], paragraph, { fontSize: 18, bounds: [150, Number.POSITIVE_INFINITY] });
  boundsBox(recorder, 399, 87, 160, 236);

  caption(recorder, MARGIN, 344, "sizes · the ladder follows the screen, so no size has to be baked ahead");
  let y = 366;
  for (const size of [12, 18, 28, 48]) {
    caption(recorder, MARGIN, y + size * 0.42, `${size} px`);
    block(recorder, [MARGIN + 74, y], "中文排版与字号", { fontSize: size });
    y += Math.max(size * 1.45, 26);
  }

  pixelRule(recorder, MARGIN, y + 14);
}

/**
 * `text-font-query` — weight, width and style, the three axes bevy's `font-query` example queries.
 *
 * The page is shaped like that example: one column per axis, one line per value. It draws with a
 * family built for this page rather than with the bundled debug face, because the axes are only worth
 * showing where they can act:
 *
 * - The family is eight static instances of one variable font, registered as faces of the same family
 *   with their own `weight` descriptors. Canvas2D picks a face by that descriptor, so 200 to 900 are
 *   eight real weights rather than one synthesised bold step. A ninth row for `Weight 100 (Thin)` is
 *   deliberately absent: the source has no 100, so it would draw the 200 instance.
 * - `width` still cannot act. The instanced faces carry no `wdth` axis, and Canvas2D drops a
 *   `font-stretch` keyword when the face has none, so the column repeats one width by construction.
 * - `style` is synthesised: the instances carry no italic, so the browser slants them itself.
 *
 * The span row at the bottom is the part bevy's example does not cover: a span overrides one axis of
 * the block's face rather than replacing the whole face.
 */
export function textFontQueryScene(recorder: FrameRecorder): void {
  const sans = MULTI_WEIGHT_SANS_FAMILY;
  heading(
    recorder,
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

  caption(recorder, weightX, captionY, "weight · 200 … 900", LABEL, captionSize);
  caption(recorder, weightX, noteY, "eight real faces, no synthesis", HINT, noteSize);
  caption(recorder, widthX, captionY, "width · nine font-stretch stops", LABEL, captionSize);
  caption(recorder, widthX, noteY, "inert · no wdth axis on these faces", HINT, noteSize);
  caption(recorder, styleX, captionY, "style", LABEL, captionSize);
  caption(recorder, styleX, noteY, "italic is slanted by the browser", HINT, noteSize);

  for (const [index, [label, weight]] of weights.entries()) {
    block(recorder, [weightX, firstRowY + index * rowStep], label, { fontSize: sampleSize, fontFamily: sans, weight });
  }

  for (const [index, width] of TEXT_FONT_WIDTHS.entries()) {
    // The label names the stop; the ink beside it is the same at every stop on these faces.
    block(recorder, [widthX, firstRowY + index * rowStep], `FontWidth::${width.toUpperCase().replaceAll("-", "_")}`, {
      fontSize: sampleSize,
      fontFamily: sans,
      width,
    });
  }

  for (const [index, [label, style]] of styles.entries()) {
    block(recorder, [styleX, firstRowY + index * rowStep], label, { fontSize: sampleSize, fontFamily: sans, style });
  }

  // The width column lists nine stops while weight lists eight, so the span row clears the longer one.
  const spanY = firstRowY + Math.max(weights.length, TEXT_FONT_WIDTHS.length) * rowStep + 12;
  caption(recorder, MARGIN, spanY, "spans · one axis each, the rest inherited from the block", LABEL, captionSize);
  block(
    recorder,
    [MARGIN, spanY + 26],
    [
      { text: "regular, " },
      { text: "bold, ", weight: 700 },
      { text: "bold italic,", weight: 700, style: "italic" },
      { text: " light", weight: 200 },
    ],
    { fontSize: 24, fontFamily: sans },
  );

  pixelRule(recorder, MARGIN, spanY + 96);
}

/** Dispatches one of the text pages by scene id. */
export function textScene(id: string, recorder: FrameRecorder): void {
  switch (id) {
    case "text-encodings": textEncodingsScene(recorder); break;
    case "text-scale": textScaleScene(recorder); break;
    case "text-world-zoom": textWorldZoomScene(recorder); break;
    case "text-layout": textLayoutScene(recorder); break;
    case "text-anchor": textAnchorScene(recorder); break;
    case "text-cjk": textCjkScene(recorder); break;
    case "text-font-query": textFontQueryScene(recorder); break;
    default: break;
  }
}
