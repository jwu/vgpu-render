/**
 * `line`: widths, alpha, dashes, strip and loop joints, dashed joints, and normal-aware lines.
 */

import { CYAN, LIME, LINE_COLUMN_SPACING, LINE_ROW_SPACING, LINE_SAMPLE_LENGTH, LINE_SAMPLE_START_Z, LINE_Y, ORANGE, TEAL, VIOLET, WHITE, lineColumnX, lineRowZ } from "../../shared/draw-3d.js";
import type { FrameDrawList, Vec3 } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ALPHA_VALUES, DASH_VALUES, JOINT_VALUES, REFERENCE_OFFSET, WIDTH_VALUES, referenceOffset } from "../../shared/layout-3d.js";

const LINE_BASE_WIDTH = 2;

const STRIP_HALF_DEPTH = 0.18;

const LOOP_HALF_DEPTH = 0.25;

const NORMAL_LINE_VALUES: readonly Vec3[] = [[0, 0, 1], [0, 0.70710677, 0.70710677], [0, 1, 0], [0, 0, -1]];

function lineStart(column: number, row: number): Vec3 {
  return referenceOffset([lineColumnX(column), LINE_Y, lineRowZ(row)]);
}

function lineEnd(column: number, row: number): Vec3 {
  return referenceOffset([lineColumnX(column) + LINE_SAMPLE_LENGTH, LINE_Y, lineRowZ(row)]);
}

function referenceStripPoints(column: number, row: number): Vec3[] {
  const x = lineColumnX(column);
  const z = lineRowZ(row);
  return [
    referenceOffset([x, LINE_Y, z + STRIP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH * 0.33, LINE_Y, z - STRIP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH * 0.66, LINE_Y, z + STRIP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH, LINE_Y, z - STRIP_HALF_DEPTH]),
  ];
}

function referenceLoopPoints(column: number, row: number): Vec3[] {
  const x = lineColumnX(column);
  const z = lineRowZ(row);
  return [
    referenceOffset([x, LINE_Y, z + LOOP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH, LINE_Y, z + LOOP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH, LINE_Y, z - LOOP_HALF_DEPTH]),
    referenceOffset([x, LINE_Y, z - LOOP_HALF_DEPTH]),
  ];
}


/** Raw reference layout data for the Line example. */
export const LINE_REFERENCE = {
  columns: 7,
  columnSpacing: LINE_COLUMN_SPACING,
  rowSpacing: LINE_ROW_SPACING,
  startZ: LINE_SAMPLE_START_Z,
  length: LINE_SAMPLE_LENGTH,
  stripHalfDepth: STRIP_HALF_DEPTH,
  loopHalfDepth: LOOP_HALF_DEPTH,
  sceneOffset: REFERENCE_OFFSET,
  columnX: lineColumnX,
  rowZ: lineRowZ,
  start: lineStart,
  end: lineEnd,
  strip: referenceStripPoints,
  loop: referenceLoopPoints,
} as const;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = context.time * 0.35;

  WIDTH_VALUES.forEach((width, row) => drawList.line(lineStart(0, row), lineEnd(0, row), { color: WHITE, width }));
  ALPHA_VALUES.forEach((alpha, row) => drawList.line(lineStart(1, row), lineEnd(1, row), { color: [1, 0.85, 0.1, alpha], width: LINE_BASE_WIDTH }));
  DASH_VALUES.forEach(([dash, space], row) => drawList.line(lineStart(2, row), lineEnd(2, row), { color: LIME, width: LINE_BASE_WIDTH, dash: [dash, space, dashOffset] }));
  JOINT_VALUES.forEach((joint, row) => drawList.lineStrip(referenceStripPoints(3, row), { color: CYAN, width: 8, joint }, false));
  JOINT_VALUES.forEach((joint, row) => drawList.lineStrip(referenceLoopPoints(4, row), { color: ORANGE, width: 8, joint }, true));
  JOINT_VALUES.forEach((joint, row) => drawList.lineStrip(referenceStripPoints(5, row), { color: VIOLET, width: 8, joint, dash: [0.18, 0.1, dashOffset] }, false));
  NORMAL_LINE_VALUES.forEach((normal, row) => drawList.line(lineStart(6, row), lineEnd(6, row), { color: TEAL, width: LINE_BASE_WIDTH, normal }));
}
