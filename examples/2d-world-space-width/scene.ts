/**
 * `2d-world-space-width`: the same width value read in two different units.
 *
 * Three primitive families, each taking its thickness through a different option —
 * `widthMode` for strokes, `sizeMode` for points, `strokeWidthMode` for shape outlines. The two
 * rows use the **same number**, so the only variable is the unit:
 *
 * - `screen` is a canvas-pixel count, so it keeps its thickness at any zoom.
 * - `world` is measured in `world2d` units and is multiplied by the camera zoom, so it grows and
 *   shrinks with the scene.
 *
 * At the page's fitted zoom the two rows therefore look alike; scroll to zoom and only the bottom
 * row changes. That is the whole point of the modes, and it cannot be shown by drawing two
 * different numbers.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { SceneContext } from "../shared/scene-context.js";
import { COLUMN_TITLE_FONT, LABELS_2D } from "../shared/2d-labels.js";
import { FILL, HINT, TITLE } from "../shared/2d-page.js";

/** The page's fitted view is 560 × 360; the extent is pinned in `meta.ts` for the zoom it gives. */
const COLUMN_X = [-170, 0, 170] as const;
/** Row 0 is the pixel unit, row 1 the world unit. */
const ROW_Y = [55, -55] as const;
/** Row labels sit in the left margin and are drawn once rather than per column. */
const ROW_LABEL_X = -252;
const ROW_LABEL_FONT = 14;
const COLUMN_TITLE_Y = ROW_Y[0]! + 45;
/** The one number both rows read; only its unit changes between them. */
const THICKNESS = 12;
const LINE_HALF = 50;
const CIRCLE_RADIUS = 20;

type Unit = "screen" | "world";

const STROKE: Color = FILL;

function sample(d2: FrameDrawList2D, family: number, x: number, y: number, unit: Unit): void {
  if (family === 0) {
    d2.line([x - LINE_HALF, y], [x + LINE_HALF, y], { width: THICKNESS, widthMode: unit, color: STROKE });
  } else if (family === 1) {
    d2.point([x, y], { size: THICKNESS, sizeMode: unit, color: STROKE });
  } else {
    d2.circle([x, y], CIRCLE_RADIUS, { strokeWidth: THICKNESS, strokeWidthMode: unit, color: STROKE });
  }
}

export function draw(drawList: FrameDrawList, _context: SceneContext): void {
  const labels = LABELS_2D["2d-world-space-width"];
  if (labels === undefined) return;
  const { d2 } = drawList;

  // The row labels name the unit. Every column carries the same two, so drawing them once in the
  // left margin is what keeps them from repeating three times.
  labels.columns[0]?.samples.forEach((label, row) => {
    drawList.text([ROW_LABEL_X, ROW_Y[row]!, 0], label, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: ROW_LABEL_FONT,
      anchor: "center",
      color: HINT,
      depthTest: false,
    });
  });

  labels.columns.forEach((column, family) => {
    const x = COLUMN_X[family]!;
    drawList.text([x, COLUMN_TITLE_Y, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
    // Same number, both rows; scroll to see only the world row follow the zoom.
    sample(d2, family, x, ROW_Y[0]!, "screen");
    sample(d2, family, x, ROW_Y[1]!, "world");
  });
}
