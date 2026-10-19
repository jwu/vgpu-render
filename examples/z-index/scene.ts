/**
 * `z-index`: the `zIndex` layering key.
 *
 * Four columns, one rule each, and two rows, one pair of renderers each:
 *
 * - **columns** — `z1 > z0` puts the second object's key higher, `z0 > z1` swaps the keys so the
 *   cover relationship reverses, `z0 = z0` holds the keys equal so the later object wins, and the
 *   last column stacks three keys to show the key is a stack rather than a pair comparison.
 * - **row 0** — two shapes. Only the keys change between the first two columns, which is what
 *   proves the key decides the order rather than the recording order.
 * - **row 1** — a shape and a text block, the two renderers that share this key space. The same
 *   four rules apply unchanged; the last column puts the label between two shapes, which a depth
 *   buffer could not express without sorting.
 *
 * Every cell is readable without the caption: the overlap takes the colour of whichever object owns
 * the higher key, and each cell's object layout is identical across columns so the eye compares
 * like with like.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { SceneContext } from "../shared/scene-context.js";
import { COLUMN_TITLE_FONT, LABELS_2D } from "../shared/2d-labels.js";
import { COOL, FILL, HINT, TITLE, WARM } from "../shared/2d-page.js";

/** The page's fitted view is 860 × 420; these centres keep every cell inside it. */
const COLUMN_X = [-300, -100, 100, 300] as const;
/** Row 0 is shapes against shapes, row 1 is shapes against text. */
const ROW_Y = [86, -86] as const;
/** Half the gap between the two objects of a two-object cell. */
const PAIR = 22;
const BOX: readonly [number, number] = [84, 60];
const NARROW: readonly [number, number] = [56, 44];
const LABEL_FONT = 30;
/** Row labels sit in the margin left of the first column, so they are drawn once, not per column. */
const ROW_LABEL_X = -403;
const ROW_LABEL_FONT = 15;
/** Row bands: a faint fill that lifts each row off the gallery's 2D grid so the cells read as a table. */
const ROW_BAND_HEIGHT = 172;
const BAND: readonly [number, number] = [900, ROW_BAND_HEIGHT];
const BAND_COLOR: Color = [1, 1, 1, 0.045];

function box(d2: FrameDrawList2D, x: number, y: number, size: readonly [number, number], zIndex: number, color: Color): void {
  d2.rect_s([x, y], size, { color, zIndex });
}

function text(drawList: FrameDrawList, x: number, y: number, zIndex: number): void {
  drawList.text([x, y, 0], "label", {
    space: "world-plane",
    pixelSize: 1,
    fontSize: LABEL_FONT,
    anchor: "center",
    color: FILL,
    zIndex,
    depthTest: false,
  });
}

/** Two rectangles, or three in the last column. Only the keys differ across the first three. */
function shapesCell(d2: FrameDrawList2D, rule: number, x: number, y: number): void {
  if (rule === 0) {
    box(d2, x - PAIR, y, BOX, 0, WARM);
    box(d2, x + PAIR, y, BOX, 1, COOL);
  } else if (rule === 1) {
    box(d2, x - PAIR, y, BOX, 1, WARM);
    box(d2, x + PAIR, y, BOX, 0, COOL);
  } else if (rule === 2) {
    box(d2, x - PAIR, y, BOX, 0, WARM);
    box(d2, x + PAIR, y, BOX, 0, COOL);
  } else {
    box(d2, x - 34, y, NARROW, 2, WARM);
    box(d2, x, y, NARROW, 1, COOL);
    box(d2, x + 34, y, NARROW, 0, FILL);
  }
}

/** A rectangle and one text block under the same four rules. */
function textCell(drawList: FrameDrawList, d2: FrameDrawList2D, rule: number, x: number, y: number): void {
  if (rule === 0) {
    box(d2, x - 14, y, BOX, 1, COOL);
    text(drawList, x + 12, y, 0);
  } else if (rule === 1) {
    box(d2, x - 14, y, BOX, 0, COOL);
    text(drawList, x + 12, y, 1);
  } else if (rule === 2) {
    box(d2, x - 14, y, BOX, 0, COOL);
    text(drawList, x + 12, y, 0);
  } else {
    // The label sits between two shapes: covered on both sides, legible in the middle.
    box(d2, x - 48, y, NARROW, 0, WARM);
    text(drawList, x, y, 1);
    box(d2, x + 48, y, NARROW, 2, COOL);
  }
}

export function draw(drawList: FrameDrawList, _context: SceneContext): void {
  const labels = LABELS_2D["z-index"];
  if (labels === undefined) return;
  const { d2 } = drawList;

  // The row bands go first and lowest so the grid stays behind them and the cells stay on top.
  for (const y of ROW_Y) d2.rect_s([0, y], BAND, { color: BAND_COLOR, zIndex: -8 });

  // The row labels name the pair of renderers each row compares. Every column carries the same
  // two, so drawing them once in the left margin is what keeps them from repeating four times.
  labels.columns[0]?.samples.forEach((sample, row) => {
    drawList.text([ROW_LABEL_X, ROW_Y[row]!, 0], sample, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: ROW_LABEL_FONT,
      anchor: "center",
      color: HINT,
      depthTest: false,
    });
  });

  labels.columns.forEach((column, index) => {
    const x = COLUMN_X[index]!;
    drawList.text([x, ROW_Y[0]! + 112, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
    shapesCell(d2, index, x, ROW_Y[0]!);
    textCell(drawList, d2, index, x, ROW_Y[1]!);
  });
}
