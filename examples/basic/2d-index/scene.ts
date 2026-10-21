/**
 * `2d-index`: every 2D primitive family in one grid, the 2D counterpart of the 3D `index` page.
 *
 * Each cell is one API call with its name underneath, so the page reads as an index of the layer
 * rather than a reference collage: strokes, markers, arrows, curves and the shape trio forms.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { FrameDrawList2D } from "../../../src/frame-draw-list-2d.js";
import type { SceneContext } from "../../shared/scene-context.js";
import type { Curve2D } from "../../../src/curve.js";
import { ACCENT, ACTION, COOL, FILL, HINT, RING, WARM, withAlpha } from "../../shared/2d-page.js";

const COLUMNS = 5;
const CELL_WIDTH = 200;
const CELL_HEIGHT = 120;
const LABEL_OFFSET = 46;

const INDEX_CURVE: Curve2D = {
  points: [
    { position: [-30, 0], out: [12, 20] },
    { position: [0, 14], in: [-12, -18], out: [12, 18] },
    { position: [30, 0], in: [-12, -20] },
  ],
};

type Cell = {
  readonly name: string;
  readonly draw: (d2: FrameDrawList2D, x: number, y: number) => void;
};

const CELLS: readonly Cell[] = [
  { name: "line", draw: (d2, x, y) => d2.line([x - 36, y], [x + 36, y], { width: 3, color: FILL }) },
  { name: "line_d", draw: (d2, x, y) => d2.line_d([x - 36, y], [x + 36, y], [12, 8, 0], { width: 3, color: FILL }) },
  { name: "ray", draw: (d2, x, y) => d2.ray([x - 36, y - 18], [72, 36], { width: 3, color: FILL }) },
  {
    name: "lineStrip",
    draw: (d2, x, y) => d2.lineStrip([[x - 36, y + 16], [x, y - 16], [x + 36, y + 16]], { width: 3, color: FILL, joint: "round" }),
  },
  {
    name: "lineLoop",
    draw: (d2, x, y) => d2.lineLoop([[x - 30, y + 14], [x - 8, y - 16], [x + 30, y + 2]], { width: 3, color: FILL, joint: "round" }),
  },
  { name: "grid", draw: (d2, x, y) => d2.grid([x, y], [3, 3], [18, 14], { width: 1.5, color: RING }) },
  {
    name: "point",
    draw: (d2, x, y) => {
      for (const [dx, dy] of [[-20, -10], [0, 12], [22, -6]] as const) {
        d2.point([x + dx, y + dy], { size: 9, round: true, color: ACCENT });
      }
    },
  },
  { name: "arrow", draw: (d2, x, y) => d2.arrow([x - 32, y + 8], [64, -16], { width: 2, color: WARM }) },
  { name: "arrow_s", draw: (d2, x, y) => d2.arrow_s([x - 32, y + 8], [64, -16], { width: 2, color: ACTION }) },
  {
    name: "curve",
    draw: (d2, x, y) => d2.curve(INDEX_CURVE, { width: 2, color: COOL, transform: { center: [x, y] } }),
  },
  { name: "rect", draw: (d2, x, y) => d2.rect([x, y], [64, 40], { strokeWidth: 2, color: FILL }) },
  { name: "rect_r", draw: (d2, x, y) => d2.rect_r([x, y], [64, 40], 14, { strokeWidth: 2, color: FILL }) },
  { name: "rect_d", draw: (d2, x, y) => d2.rect_d([x, y], [64, 40], [10, 6, 0], { strokeWidth: 2, color: FILL }) },
  { name: "rect_s", draw: (d2, x, y) => d2.rect_s([x, y], [64, 40], { color: FILL }) },
  {
    name: "rect_h",
    draw: (d2, x, y) => d2.rect_h([x, y], [64, 40], { hatch: { spacing: 10, width: 4 }, color: ACCENT }),
  },
  { name: "circle", draw: (d2, x, y) => d2.circle([x, y], 26, { strokeWidth: 2, color: FILL }) },
  { name: "circle_s", draw: (d2, x, y) => d2.circle_s([x, y], 26, { color: FILL }) },
  {
    name: "circle_h",
    draw: (d2, x, y) =>
      d2.circle_h([x, y], 26, { hatch: { spacing: 9, angle: -Math.PI / 4, width: 3.5 }, color: COOL }),
  },
  { name: "ellipse", draw: (d2, x, y) => d2.ellipse([x, y], [34, 22], { strokeWidth: 2, color: FILL }) },
  {
    name: "arc",
    draw: (d2, x, y) => d2.arc([x, y], 26, { startAngle: -Math.PI / 2, sweep: Math.PI * 1.2, strokeWidth: 2, color: FILL }),
  },
  {
    // An arc has no interior, so its hatch is a striped stroke rather than a striped fill.
    name: "arc_h",
    draw: (d2, x, y) =>
      d2.arc_h([x, y], 26, {
        startAngle: -Math.PI / 2,
        sweep: Math.PI * 1.2,
        strokeWidth: 10,
        hatch: { spacing: 8, width: 4 },
        color: ACTION,
      }),
  },
  { name: "annulus", draw: (d2, x, y) => d2.annulus([x, y], 14, 26, { strokeWidth: 2, color: FILL }) },
  { name: "capsule", draw: (d2, x, y) => d2.capsule([x, y], 14, 36, { strokeWidth: 2, color: FILL }) },
  { name: "polygon", draw: (d2, x, y) => d2.polygon([x, y], 26, 6, { strokeWidth: 2, color: FILL }) },
  {
    name: "triangle",
    draw: (d2, x, y) => d2.triangle([x, y + 22], [x - 26, y - 16], [x + 26, y - 16], { strokeWidth: 2, color: FILL }),
  },
  { name: "rhombus", draw: (d2, x, y) => d2.rhombus([x, y], [52, 44], { strokeWidth: 2, color: FILL }) },
  {
    name: "rhombus_h",
    draw: (d2, x, y) =>
      d2.rhombus_h([x, y], [52, 44], {
        hatch: { spacing: 8, angle: Math.PI / 6, width: 3, background: withAlpha(RING, 0.35) },
        color: WARM,
      }),
  },
  {
    name: "sector",
    draw: (d2, x, y) => d2.sector([x, y], 26, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, strokeWidth: 2, color: FILL }),
  },
  {
    name: "segment",
    draw: (d2, x, y) => d2.segment([x, y], 26, { startAngle: -Math.PI / 2, sweep: Math.PI * 0.8, strokeWidth: 2, color: FILL }),
  },
];

export function draw(drawList: FrameDrawList, _context: SceneContext): void {
  const rows = Math.ceil(CELLS.length / COLUMNS);
  CELLS.forEach((cell, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x = (column - (COLUMNS - 1) / 2) * CELL_WIDTH;
    const y = ((rows - 1) / 2 - row) * CELL_HEIGHT;
    cell.draw(drawList.d2, x, y);
    drawList.text([x, y - LABEL_OFFSET, 0], cell.name, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: 15,
      anchor: "top-center",
      color: HINT,
      depthTest: false,
    });
  });
}
