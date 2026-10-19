/**
 * `circle`: width, radius, segment count, rotation, joints, dashes, solid and normal variants.
 */

import { CIRCLE_COLUMN_SPACING, CIRCLE_RADIUS, CIRCLE_RADIUS_ROW_SPACING, CIRCLE_ROW_SPACING, CIRCLE_SAMPLE_START_Z, CIRCLE_TUNNEL_DEPTH_STEP, CIRCLE_TUNNEL_RADIUS, CIRCLE_Y, CYAN, LIME, ORANGE, TEAL, VIOLET, WHITE, circleColumnX, circleRowSpacing, drawCircleNormals } from "../../shared/draw-3d.js";
import type { Color, FrameDrawList, Vec3 } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { DASH_VALUES, JOINT_VALUES, RADIUS_VALUES, REFERENCE_OFFSET, SEGMENT_VALUES, WIDTH_VALUES, basisCirclePoints, circleBasis, normalizeVector, referenceOffset, rotateAroundAxis, type CircleBasis } from "../../shared/layout-3d.js";
import { disc, type MeshData } from "../../../src/geometry-generators.js";

const CIRCLE_BASE_WIDTH = 2;

const CIRCLE_SEGMENTS = 64;

const CIRCLE_JOINT_SEGMENTS = 12;

const CIRCLE_ROTATION_SAMPLES = 8;

const CIRCLE_TUNNEL_SCALE_STEP = 0.06;

const CIRCLE_TUNNEL_TWIST_STEP = Math.PI * 0.12;

const CIRCLE_DASH_SPEED = 0.6;

function circleCenterLocal(column: number, row: number): Vec3 {
  return [circleColumnX(column), CIRCLE_Y, CIRCLE_SAMPLE_START_Z - row * circleRowSpacing(column)];
}


/** Raw reference layout data, exported so tests and the 3D labels share one source. */
export const CIRCLE_REFERENCE = {
  columns: 11,
  columnSpacing: CIRCLE_COLUMN_SPACING,
  columnOffset: 0.5,
  rowSpacing: CIRCLE_ROW_SPACING,
  radiusRowSpacing: CIRCLE_RADIUS_ROW_SPACING,
  startZ: CIRCLE_SAMPLE_START_Z,
  radius: CIRCLE_RADIUS,
  baseWidth: CIRCLE_BASE_WIDTH,
  sceneOffset: REFERENCE_OFFSET,
  solidColor: [0.25, 0.65, 1, 0.45] as Color,
  columnX: circleColumnX,
  center: (column: number, row: number): Vec3 => referenceOffset(circleCenterLocal(column, row)),
} as const;

function translateMesh(mesh: MeshData, position: Vec3): MeshData {
  const move = (p: Vec3): Vec3 => [p[0] + position[0], p[1] + position[1], p[2] + position[2]];
  return { triangles: mesh.triangles.map(([a, b, c]) => [move(a), move(b), move(c)]), segments: mesh.segments.map(([a, b]) => [move(a), move(b)]) };
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = context.time * CIRCLE_DASH_SPEED;
  const flat = circleBasis([0, 1, 0], 0);
  const circle = (column: number, row: number, radius: number, segments: number, basis: CircleBasis = flat): Vec3[] =>
    basisCirclePoints(circleCenterLocal(column, row), radius, segments, basis);

  WIDTH_VALUES.forEach((width, row) => drawList.lineStrip(circle(0, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color: WHITE, width }, true));
  RADIUS_VALUES.forEach((radius, row) => drawList.lineStrip(circle(1, row, radius, CIRCLE_SEGMENTS), { color: CYAN, width: 2 }, true));
  SEGMENT_VALUES.forEach((segments, row) => drawList.lineStrip(circle(2, row, CIRCLE_RADIUS, segments), { color: LIME, width: 2 }, true));

  for (let row = 0; row < CIRCLE_ROTATION_SAMPLES; row++) {
    const tilted = rotateAroundAxis([0, 1, 0], [1, 0, 0], -Math.PI * 0.38);
    const normal = normalizeVector(rotateAroundAxis(tilted, [0, 0, 1], row * CIRCLE_TUNNEL_TWIST_STEP));
    const basis = circleBasis(normal, row * Math.PI * 0.08);
    const center: Vec3 = [circleColumnX(3), CIRCLE_Y + 0.35, CIRCLE_SAMPLE_START_Z - row * CIRCLE_ROW_SPACING - row * CIRCLE_TUNNEL_DEPTH_STEP];
    const scale = 1 - row * CIRCLE_TUNNEL_SCALE_STEP;
    drawList.lineStrip(basisCirclePoints(center, CIRCLE_TUNNEL_RADIUS * scale, CIRCLE_SEGMENTS, basis), { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: 2 }, true);
  }

  JOINT_VALUES.forEach((joint, row) => drawList.lineStrip(circle(4, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), { color: VIOLET, width: 8, joint }, true));
  DASH_VALUES.forEach(([dash, space], row) => drawList.lineStrip(circle(5, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color: ORANGE, width: 2, dash: [dash, space, dashOffset] }, true));
  JOINT_VALUES.forEach((joint, row) => drawList.lineStrip(circle(6, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), { color: [1, 0.3, 0.6, 1], width: 8, joint, dash: [0.18, 0.1, dashOffset] }, true));

  for (let row = 0; row < 4; row++) {
    const color: Color = row === 1 ? [0.25, 0.95, 0.9, 0.35] : row === 2 ? [1, 0.45, 0.2, 1] : TEAL;
    const width = row === 3 ? 10 : CIRCLE_BASE_WIDTH;
    drawCircleNormals(drawList, circle(7, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), CIRCLE_SEGMENTS, flat, { color, width, joint: "round" });
  }
  DASH_VALUES.forEach(([dash, space], row) => drawCircleNormals(drawList, circle(8, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), CIRCLE_SEGMENTS, flat, { color: TEAL, width: CIRCLE_BASE_WIDTH, dash: [dash, space, dashOffset], joint: "round" }));
  JOINT_VALUES.forEach((joint, row) => drawCircleNormals(drawList, circle(9, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), CIRCLE_JOINT_SEGMENTS, flat, { color: TEAL, width: 8, joint }));

  SEGMENT_VALUES.forEach((segments, row) => {
    const center = referenceOffset(circleCenterLocal(10, row));
    drawList.mesh(translateMesh(disc(CIRCLE_RADIUS, segments), center), { color: [0.25, 0.65, 1, 0.45], solid: true });
  });
}
