/**
 * `rect`: wire and solid rectangles with size, rotation, joints, dashes, and normal variants.
 */

import { CYAN, DASH_OFFSET_SPEED, IDENTITY_BASIS, ORANGE_FULL, PINK, RECT_LAYOUT, RECT_ROTATION_TUNNEL_DEPTH_STEP, RECT_S_TUNNEL_DEPTH_STEP, RECT_S_TUNNEL_WIDTH, RECT_SIZE_VALUES, RECT_WIDTH, TEAL, VIOLET, WHITE, drawRectNormals, rectLoop, rectMesh, rotateBasis, type Basis3 } from "../../shared/draw-3d.js";
import { DASH_VALUES, JOINT_VALUES, NORMAL_SAMPLE_COUNT, ROTATION_SAMPLE_COUNT, WIDTH_VALUES, crossVector, fromHsv, normalSampleColor, normalSampleWidth, normalizeVector, referenceOffset } from "../../shared/layout-3d.js";
import type { Color, FrameDrawList, Vec3 } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";

const RECT_HEIGHT = 0.45;

const RECT_BASE_LINE_WIDTH = 2;

const RECT_EMPHASIS_LINE_WIDTH = 5.5;


const RECT_ROTATION_TUNNEL_WIDTH = 1.15;

const RECT_ROTATION_TUNNEL_HEIGHT = 0.7;

const RECT_ROTATION_TUNNEL_SCALE_STEP = 0.07;

const RECT_ROTATION_TUNNEL_TWIST_STEP = Math.PI * 0.12;

const RECT_S_SAMPLE_COUNT = 8;

const RECT_S_TUNNEL_HEIGHT = 0.65;

const RECT_S_TUNNEL_SCALE_STEP = 0.06;

const RECT_S_TUNNEL_TWIST_STEP = Math.PI * 0.12;


/** `_get_rect_rotation(0.0, true)`: flat rect spanning the XZ plane. */
const RECT_FLAT_BASIS: Basis3 = { x: [1, 0, 0], y: normalizeVector(crossVector([0, 1, 0], [1, 0, 0])), z: [0, 1, 0] };

function rectTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = RECT_LAYOUT.atLocal(column, row);
  return referenceOffset([center[0], center[1] + yOffset, center[2] - row * depthStep]);
}

function rectRotationTunnelBasis(row: number): Basis3 {
  return rotateBasis(IDENTITY_BASIS, [0, 0, 1], row * RECT_ROTATION_TUNNEL_TWIST_STEP);
}

function rectSolidBasis(row: number): Basis3 {
  const twisted = rotateBasis(IDENTITY_BASIS, [0, 0, 1], row * RECT_S_TUNNEL_TWIST_STEP);
  return rotateBasis(twisted, [1, 0, 0], row * 0.08);
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = context.time * DASH_OFFSET_SPEED;

  // rect(width)
  WIDTH_VALUES.forEach((width, row) => {
    drawList.lineStrip(rectLoop(RECT_LAYOUT.at(0, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: WHITE, width }, true);
  });
  // rect(size)
  RECT_SIZE_VALUES.forEach(([width, height], row) => {
    drawList.lineStrip(rectLoop(RECT_LAYOUT.at(1, row), RECT_FLAT_BASIS, width, height), { color: CYAN, width: RECT_BASE_LINE_WIDTH }, true);
  });
  // rect(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * RECT_ROTATION_TUNNEL_SCALE_STEP;
    const center = rectTunnelCenter(2, row, 0.35, RECT_ROTATION_TUNNEL_DEPTH_STEP);
    const basis = rectRotationTunnelBasis(row);
    const color: Color = [0.7, 1, 0.25, 1 - row * 0.07];
    drawList.lineStrip(rectLoop(center, basis, RECT_ROTATION_TUNNEL_WIDTH * scale, RECT_ROTATION_TUNNEL_HEIGHT * scale), { color, width: RECT_BASE_LINE_WIDTH }, true);
  }
  // rect(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawList.lineStrip(rectLoop(RECT_LAYOUT.at(3, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: VIOLET, width: 8, joint }, true);
  });
  // rect_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawList.lineStrip(rectLoop(RECT_LAYOUT.at(4, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: ORANGE_FULL, width: RECT_BASE_LINE_WIDTH, dash: [dash, space, dashOffset] }, true);
  });
  // rect_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawList.lineStrip(rectLoop(RECT_LAYOUT.at(5, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: PINK, width: 8, dash: [0.18, 0.1, dashOffset], joint }, true);
  });
  // rect_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawRectNormals(drawList, rectLoop(RECT_LAYOUT.at(6, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), RECT_FLAT_BASIS, { color: normalSampleColor(row), width: normalSampleWidth(row, RECT_BASE_LINE_WIDTH), joint: "round" });
  }
  // rect_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawRectNormals(drawList, rectLoop(RECT_LAYOUT.at(7, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), RECT_FLAT_BASIS, { color: TEAL, width: RECT_BASE_LINE_WIDTH, dash: [dash, space, dashOffset], joint: "round" });
  });
  // rect_n(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawRectNormals(drawList, rectLoop(RECT_LAYOUT.at(8, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), RECT_FLAT_BASIS, { color: TEAL, width: RECT_EMPHASIS_LINE_WIDTH, joint });
  });
  // rect_s(solid)
  for (let row = 0; row < RECT_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * RECT_S_TUNNEL_SCALE_STEP;
    const hue = row / RECT_S_SAMPLE_COUNT + 0.6;
    const center = rectTunnelCenter(9, row, 0.5, RECT_S_TUNNEL_DEPTH_STEP);
    const basis = rectSolidBasis(row);
    const color = fromHsv(hue, 0.7, 1, 1 - row * 0.08);
    drawList.mesh(rectMesh(center, basis, RECT_S_TUNNEL_WIDTH * scale, RECT_S_TUNNEL_HEIGHT * scale), { color, solid: true });
  }
}
