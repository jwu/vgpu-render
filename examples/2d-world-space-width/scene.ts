/**
 * `2d-world-space-width`: one width value in two units, across every shape's three forms.
 *
 * Six columns — each shape's three forms (`<shape>`, `<shape>_s`, `<shape>_d`) under each unit —
 * and one row per shape. Both units read the **same** `strokeWidth`, so the only variable is the
 * unit: `screen` is a canvas-pixel count, `world` is `world2d` units multiplied by the camera
 * zoom. At the page's fitted zoom the pairs therefore look alike; scroll to zoom and only the
 * `world` columns grow.
 *
 * `_s` is a fill and carries no outline, so it ignores `strokeWidthMode` altogether — its two
 * columns stay identical at every zoom. That is worth showing rather than hiding: the mode is a
 * property of the outline, not of the shape.
 *
 * Twelve rows keep the fitted zoom near 1, which is what lets the whole matrix fit on one page.
 * The trade is that the unit difference only becomes obvious once you zoom in past the fitted
 * view; before that the matrix reads as a variant index.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { SceneContext } from "../shared/scene-context.js";
import { LABELS_2D } from "../shared/2d-labels.js";
import { FILL, HINT, TITLE } from "../shared/2d-page.js";

/** The page's fitted view; pinned in `meta.ts` so the zoom stays just above 1. */
const COLUMN_STEP = 150;
const ROW_STEP = 70;
const ROWS = 12;
const COLUMNS = 6;
const COLUMN_TITLE_Y = ((ROWS - 1) / 2) * ROW_STEP + 30;
const COLUMN_TITLE_FONT = 16;
const ROW_LABEL_X = -425;
const ROW_LABEL_FONT = 14;
/** The one number every outline reads; only its unit changes between columns. */
const THICKNESS = 7;
const DASH = [14, 8, 0] as const;

const STROKE: Color = FILL;
const FILLED: Color = FILL;

type Unit = "screen" | "world";
type Form = "outline" | "solid" | "dashed";
type ShapeName = "rect" | "rect_r" | "circle" | "ellipse" | "arc" | "annulus" | "capsule" | "polygon" | "triangle" | "rhombus" | "sector" | "segment";

const SHAPES: readonly ShapeName[] = [
  "rect", "rect_r", "circle", "ellipse", "arc", "annulus",
  "capsule", "polygon", "triangle", "rhombus", "sector", "segment",
];
/** Column order is form-major, so each form's two units sit side by side and can be compared. */
const FORMS: readonly Form[] = ["outline", "solid", "dashed"];
const UNITS: readonly Unit[] = ["screen", "world"];

/** The matrix is offset right by half the row-label margin so the whole block sits centred. */
const COLUMN_OFFSET = 45;
const columnX = (column: number): number => (column - (COLUMNS - 1) / 2) * COLUMN_STEP + COLUMN_OFFSET;
const rowY = (row: number): number => ((ROWS - 1) / 2 - row) * ROW_STEP;

function outline(unit: Unit): { strokeWidth: number; strokeWidthMode: Unit; color: Color } {
  return { strokeWidth: THICKNESS, strokeWidthMode: unit, color: STROKE };
}

/** One cell: the shape in one form, at one unit. Only the outline forms read `unit`. */
function drawCell(d2: FrameDrawList2D, shape: ShapeName, x: number, y: number, unit: Unit, form: Form): void {
  const wire = outline(unit);
  const solid = { color: FILLED };
  const arcOptions = { startAngle: -Math.PI / 2, sweep: Math.PI * 1.2 };
  switch (shape) {
    case "rect":
      if (form === "outline") d2.rect([x, y], [64, 36], wire);
      else if (form === "solid") d2.rect_s([x, y], [64, 36], solid);
      else d2.rect_d([x, y], [64, 36], DASH, wire);
      break;
    case "rect_r":
      if (form === "outline") d2.rect_r([x, y], [64, 36], 12, wire);
      else if (form === "solid") d2.rect_r_s([x, y], [64, 36], 12, solid);
      else d2.rect_r_d([x, y], [64, 36], 12, DASH, wire);
      break;
    case "circle":
      if (form === "outline") d2.circle([x, y], 18, wire);
      else if (form === "solid") d2.circle_s([x, y], 18, solid);
      else d2.circle_d([x, y], 18, DASH, wire);
      break;
    case "ellipse":
      if (form === "outline") d2.ellipse([x, y], [30, 18], wire);
      else if (form === "solid") d2.ellipse_s([x, y], [30, 18], solid);
      else d2.ellipse_d([x, y], [30, 18], DASH, wire);
      break;
    case "arc":
      // An arc has no interior, so there is no `_s` form: that cell stays empty by design rather
      // than being filled with a stand-in that would read as a bug in the picture.
      if (form === "outline") d2.arc([x, y], 20, { ...arcOptions, ...wire });
      else if (form === "dashed") d2.arc_d([x, y], 20, DASH, { ...arcOptions, ...wire });
      break;
    case "annulus":
      if (form === "outline") d2.annulus([x, y], 12, 22, wire);
      else if (form === "solid") d2.annulus_s([x, y], 12, 22, solid);
      else d2.annulus_d([x, y], 12, 22, DASH, wire);
      break;
    case "capsule":
      if (form === "outline") d2.capsule([x, y], 9, 22, wire);
      else if (form === "solid") d2.capsule_s([x, y], 9, 22, solid);
      else d2.capsule_d([x, y], 9, 22, DASH, wire);
      break;
    case "polygon":
      if (form === "outline") d2.polygon([x, y], 18, 6, wire);
      else if (form === "solid") d2.polygon_s([x, y], 18, 6, solid);
      else d2.polygon_d([x, y], 18, 6, DASH, wire);
      break;
    case "triangle": {
      const a: readonly [number, number] = [x, y - 20];
      const b: readonly [number, number] = [x - 30, y + 12];
      const c: readonly [number, number] = [x + 30, y + 12];
      if (form === "outline") d2.triangle(a, b, c, wire);
      else if (form === "solid") d2.triangle_s(a, b, c, solid);
      else d2.triangle_d(a, b, c, DASH, wire);
      break;
    }
    case "rhombus":
      if (form === "outline") d2.rhombus([x, y], [56, 34], wire);
      else if (form === "solid") d2.rhombus_s([x, y], [56, 34], solid);
      else d2.rhombus_d([x, y], [56, 34], DASH, wire);
      break;
    case "sector":
      if (form === "outline") d2.sector([x, y], 20, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, ...wire });
      else if (form === "solid") d2.sector_s([x, y], 20, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, ...solid });
      else d2.sector_d([x, y], 20, DASH, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, ...wire });
      break;
    case "segment":
      if (form === "outline") d2.segment([x, y], 20, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, ...wire });
      else if (form === "solid") d2.segment_s([x, y], 20, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, ...solid });
      else d2.segment_d([x, y], 20, DASH, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, ...wire });
      break;
  }
}

export function draw(drawList: FrameDrawList, _context: SceneContext): void {
  const labels = LABELS_2D["2d-world-space-width"];
  if (labels === undefined) return;
  const { d2 } = drawList;

  labels.columns.forEach((column, index) => {
    drawList.text([columnX(index), COLUMN_TITLE_Y, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
  });

  SHAPES.forEach((shape, row) => {
    const y = rowY(row);
    drawList.text([ROW_LABEL_X, y, 0], shape, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: ROW_LABEL_FONT,
      anchor: "center",
      color: HINT,
      depthTest: false,
    });
    FORMS.forEach((form, formIndex) => {
      UNITS.forEach((unit, unitIndex) => {
        drawCell(d2, shape, columnX(formIndex * UNITS.length + unitIndex), y, unit, form);
      });
    });
  });
}
