/**
 * The 11 × 3 easing matrix every battle swing page is drawn on.
 *
 * Columns are the anime.js families, rows the directions, and each cell gets a square plot of its
 * curve above the effect it drives. Both swing pages share this: the layout, the headings and the
 * plot are the same, only the swing drawn inside a cell differs.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import {
  EASING_DIRECTIONS,
  EASING_FAMILIES,
  easingOf,
  type Easing,
  type EasingDirection,
  type EasingFamily,
} from "./easing.js";
import { withAlpha } from "./params.js";

export const MATRIX_COLUMNS = EASING_FAMILIES.length;
export const MATRIX_ROWS = EASING_DIRECTIONS.length;

/** Horizontal gap between two families, in `world2d` units. Eleven columns share one screen. */
const COLUMN_SPACING = 4.4;
/** Vertical gap between two directions: plot, gap, effect. */
const ROW_SPACING = 5.6;
/** Column titles sit above the first row; row labels sit left of the first column. */
const COLUMN_TITLE_OFFSET = 3.6;
const ROW_LABEL_OFFSET = -2.9;

/** The square curve plot above each cell. */
const PLOT_SIZE = 2.4;
/** Bottom edge of the plot, relative to the cell centre. */
const PLOT_BOTTOM = 1.3;
/**
 * Vertical headroom of the plot, as a fraction of its height on each side. `back` and `elastic`
 * leave the 0-1 box; the headroom is what keeps that overshoot inside the plot instead of running
 * into the row above.
 */
const PLOT_HEADROOM = 0.15;
/** Curve samples per plot; enough to show a bounce landing without flooding the command list. */
const PLOT_SEGMENTS = 14;

const LABEL_COLOR = [0.62, 0.7, 0.82, 1] as const;
const PLOT_AXIS_COLOR = [0.45, 0.52, 0.62, 0.85] as const;
const PLOT_GUIDE_COLOR = [0.38, 0.44, 0.54, 0.6] as const;
const PLOT_CURVE_COLOR = [0.82, 0.9, 1, 0.92] as const;

/** World extent a battle page fits, so its `meta.ts` does not have to recompute the layout. */
export const MATRIX_VIEW = { width: 50, height: 20 } as const;

/** Centre of cell `(column, row)`, the whole matrix centred on the origin. */
export function cellX(column: number, columns: number = MATRIX_COLUMNS): number {
  return (column - (columns - 1) / 2) * COLUMN_SPACING;
}
export function cellY(row: number, rows: number = MATRIX_ROWS): number {
  return ((rows - 1) / 2 - row) * ROW_SPACING;
}

export type MatrixCell = {
  readonly center: readonly [number, number];
  readonly family: EasingFamily;
  readonly direction: EasingDirection;
  /** The curve this cell plays, i.e. `easingOf(family, direction)`. */
  readonly ease: Easing;
};

/** Walks every cell in reading order (row by row), so a page only has to draw one cell. */
export function forEachCell(callback: (cell: MatrixCell) => void): void {
  for (let row = 0; row < MATRIX_ROWS; row++) {
    const direction = EASING_DIRECTIONS[row]!.id;
    for (let column = 0; column < MATRIX_COLUMNS; column++) {
      const family = EASING_FAMILIES[column]!;
      callback({
        center: [cellX(column), cellY(row)],
        family,
        direction,
        ease: easingOf(family, direction),
      });
    }
  }
}

/**
 * Column titles and row labels.
 *
 * A cell's own name is the column and row it sits in (`inQuart`), so no per-cell label is drawn: at
 * eleven columns there is no room for one. Headings are drawn first, so no cell paints over them.
 */
export function drawHeadings(drawList: FrameDrawList): void {
  for (let column = 0; column < MATRIX_COLUMNS; column++) {
    drawList.text([cellX(column), cellY(0) + COLUMN_TITLE_OFFSET, 0], EASING_FAMILIES[column]!.label, {
      space: "world-plane",
      fontSize: 32,
      pixelSize: 0.0165,
      anchor: "bottom-center",
      color: LABEL_COLOR,
      depthTest: false,
    });
  }
  for (let row = 0; row < MATRIX_ROWS; row++) {
    drawList.text([cellX(0) + ROW_LABEL_OFFSET, cellY(row), 0], EASING_DIRECTIONS[row]!.label, {
      space: "world-plane",
      fontSize: 30,
      pixelSize: 0.0155,
      anchor: "center-right",
      color: LABEL_COLOR,
      depthTest: false,
    });
  }
}

/**
 * The cell's curve: x is the raw window position, y is the eased value.
 *
 * `ease` is mapped with `PLOT_HEADROOM` on both ends, so the overshoot of `back` and `elastic` stays
 * inside the square instead of leaving it. The identity line (linear) is drawn as the guide, which is
 * why `linear` is also the first column.
 */
export function drawCurvePlot(
  drawList: FrameDrawList,
  origin: readonly [number, number],
  ease: Easing,
  progress: number,
  headColor: readonly [number, number, number, number],
): void {
  const d2 = drawList.d2;
  const [left, bottom] = origin;
  const span = 1 + 2 * PLOT_HEADROOM;
  const yOf = (value: number): number => bottom + ((value + PLOT_HEADROOM) / span) * PLOT_SIZE;
  const at = (t: number): readonly [number, number] => [left + t * PLOT_SIZE, yOf(ease(t))];

  const zeroY = yOf(0);
  const oneY = yOf(1);
  d2.line([left, zeroY], [left + PLOT_SIZE, zeroY], { width: 1, color: PLOT_AXIS_COLOR });
  d2.line([left, zeroY], [left, oneY], { width: 1, color: PLOT_AXIS_COLOR });
  // The identity line, so "ahead of linear" and "behind linear" read at a glance.
  d2.line([left, zeroY], [left + PLOT_SIZE, oneY], { width: 1, color: PLOT_GUIDE_COLOR });

  let previous = at(0);
  for (let index = 1; index <= PLOT_SEGMENTS; index++) {
    const next = at(index / PLOT_SEGMENTS);
    d2.line(previous, next, { width: 2, color: PLOT_CURVE_COLOR });
    previous = next;
  }

  // The playhead: same raw progress the effect uses, so plot and effect move together.
  d2.circle_s(at(progress), PLOT_SIZE * 0.045, { color: withAlpha(headColor, 0.95) });
}

/** Where a cell's plot sits, given its centre. */
export function plotOrigin(center: readonly [number, number]): readonly [number, number] {
  return [center[0] - PLOT_SIZE / 2, center[1] + PLOT_BOTTOM];
}
