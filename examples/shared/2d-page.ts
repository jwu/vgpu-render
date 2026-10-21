/**
 * Shared scaffolding for the 2D example pages: palette, heading, matrix layout and
 * the cross marker every page composes from.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { FrameDrawList2D, Shape2DHatch } from "../../src/frame-draw-list-2d.js";
import { COLUMN_SPACING, COLUMN_TITLE_FONT, LABELS_2D, ROW_SPACING, SAMPLE_LABEL_FONT, tableRows } from "./2d-labels.js";


export const TITLE: Color = [0.92, 0.95, 1, 1];
export const HINT: Color = [0.55, 0.62, 0.72, 1];
export const GRID: Color = [0.32, 0.36, 0.44, 0.55];
export const FILL: Color = [0.93, 0.95, 0.98, 1];
export const RING: Color = [0.55, 0.72, 1, 1];
export const WARM: Color = [1, 0.72, 0.36, 1];
export const COOL: Color = [0.42, 0.86, 0.78, 1];
export const ACCENT: Color = [1, 0.55, 0.66, 1];
export const ACTION: Color = [0.98, 0.86, 0.42, 1];
/** Coordinate axes, matching the 3D x/y convention. */
export const AXIS_X: Color = [1, 0, 0, 1];
export const AXIS_Y: Color = [0, 1, 0, 1];

/** The same RGB with a different alpha, for the opacity columns. */
export function withAlpha(color: Color, alpha: number): Color {
  return [color[0], color[1], color[2], alpha];
}

/**
 * The four stripe patterns every shape page's `<shape>_h` column shows: a wide 45-degree stripe, an
upright one, a fine one, and a moving one over a filled base. Only the last row carries
 * `background` and `phase`, which is what separates the hatch-mask reading from a solid base with
a second colour.
 *
 * One table rather than eleven copies: the point of the column is that every primitive answers the
 * same question, so the samples have to stay identical across pages.
 */
const HATCH_SAMPLES: readonly Shape2DHatch[] = [
  { spacing: 16, angle: Math.PI / 4, width: 5 },
  { spacing: 10, angle: Math.PI / 2, width: 4 },
  { spacing: 6, angle: -Math.PI / 6, width: 2 },
  { spacing: 16, angle: Math.PI / 4, width: 6 },
];

/** Stripe pattern of one `<shape>_h` sample row; `phase` only moves the last, scrolling row. */
export function hatchSample(row: number, phase: number): Shape2DHatch {
  const sample = HATCH_SAMPLES[row % HATCH_SAMPLES.length] ?? HATCH_SAMPLES[0]!;
  return row === HATCH_SAMPLES.length - 1
    ? { ...sample, phase, background: withAlpha(RING, 0.35) }
    : sample;
}

export type Table2D = {
  readonly d2: FrameDrawList2D;
  readonly rows: number;
  /** Column centre, kept for the column titles. */
  readonly columnX: (column: number) => number;
  /** Centre of the shape area: shapes live in the right part of a column, labels to their left. */
  readonly shapeX: (column: number) => number;
  readonly rowY: (row: number) => number;
};

/**
 * Lays out a matrix page and draws its labels: a centred column title above every column and one
 * sample label under every sample. Labels are `world-plane` blocks at `pixelSize: 1`, so one font
 * pixel is one `world2d` unit and the labels scale with the geometry.
 */
export function table2D(drawList: FrameDrawList, id: string): Table2D {
  const labels = LABELS_2D[id];
  if (labels === undefined) throw new Error(`no 2D label table for "${id}"`);
  const columns = labels.columns.length;
  const rows = tableRows(id);
  const spacing = labels.spacing ?? COLUMN_SPACING;
  const columnX = (column: number): number => (column - (columns - 1) / 2) * spacing;
  // A column is split into a label strip on the left and the shape area on the right, the same
  // arrangement the 3D scenes use (right-aligned row label, sample to its right).
  const shapeX = (column: number): number => columnX(column) + spacing * 0.245;
  const labelX = (column: number): number => columnX(column) - spacing * 0.1;
  const rowY = (row: number): number => ((rows - 1) / 2 - row) * ROW_SPACING;
  const titleY = (rows * ROW_SPACING) / 2 + 24;
  labels.columns.forEach((column, index) => {
    drawList.text([shapeX(index), titleY, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: labels.titleFont ?? COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
    column.samples.forEach((sample, row) => {
      drawList.text([labelX(index), rowY(row), 0], sample, {
        space: "world-plane",
        pixelSize: 1,
        fontSize: SAMPLE_LABEL_FONT,
        anchor: "center-right",
        color: HINT,
        depthTest: false,
      });
    });
  });
  return { d2: drawList.d2, rows, columnX, shapeX, rowY };
}

/** Two crossing strokes, bevy's `cross_2d`. */
export function cross(d2: FrameDrawList2D, center: [number, number], size: number, color: Color): void {
  const [x, y] = center;
  d2.line([x - size, y], [x + size, y], { width: 3, color });
  d2.line([x, y - size], [x, y + size], { width: 3, color });
}
