/**
 * `box`: wire and solid boxes with size, rotation, dashes, and normal variants.
 */

import { BOX_ROTATION_TUNNEL_DEPTH_STEP, BOX_ROTATION_TUNNEL_SCALE_STEP, BOX_ROTATION_TUNNEL_SIZE, BOX_ROTATION_TUNNEL_Y, BOX_SIZE, BOX_SIZE_VALUES, BOX_S_TUNNEL_DEPTH_STEP, BOX_S_TUNNEL_SCALE_STEP, BOX_S_TUNNEL_SIZE, BOX_S_TUNNEL_Y, CYAN, DASH_OFFSET_SPEED, IDENTITY_BASIS, ORANGE_FULL, TEAL, WHITE, boxCenter, boxRotationTunnelBasis, boxSolidBasis, boxTunnelCenter, drawBox, drawBoxNormals, fposmod, scaleVec, transformMeshByBasis } from "../../shared/draw-3d.js";
import type { Color, FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { box } from "../../../src/geometry-generators.js";
import { DASH_VALUES, NORMAL_SAMPLE_COUNT, ROTATION_SAMPLE_COUNT, WIDTH_VALUES, fromHsv, normalSampleColor, normalSampleWidth } from "../../shared/layout-3d.js";

const BOX_BASE_LINE_WIDTH = 2;

const BOX_S_SAMPLE_COUNT = 8;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = context.time * DASH_OFFSET_SPEED;

  // box(width)
  WIDTH_VALUES.forEach((width, row) => {
    drawBox(drawList, boxCenter(0, row), IDENTITY_BASIS, BOX_SIZE, { color: WHITE, width });
  });
  // box(size)
  BOX_SIZE_VALUES.forEach((size, row) => {
    drawBox(drawList, boxCenter(1, row), IDENTITY_BASIS, size, { color: CYAN, width: BOX_BASE_LINE_WIDTH });
  });
  // box(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * BOX_ROTATION_TUNNEL_SCALE_STEP;
    const center = boxTunnelCenter(2, row, BOX_ROTATION_TUNNEL_Y, BOX_ROTATION_TUNNEL_DEPTH_STEP);
    const color: Color = [0.7, 1, 0.25, 1 - row * 0.07];
    drawBox(drawList, center, boxRotationTunnelBasis(row), scaleVec(BOX_ROTATION_TUNNEL_SIZE, scale), { color, width: BOX_BASE_LINE_WIDTH });
  }
  // box_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawBox(drawList, boxCenter(3, row), IDENTITY_BASIS, BOX_SIZE, { color: ORANGE_FULL, width: BOX_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // box_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawBoxNormals(drawList, boxCenter(4, row), IDENTITY_BASIS, BOX_SIZE, { color: normalSampleColor(row), width: normalSampleWidth(row, BOX_BASE_LINE_WIDTH) });
  }
  // box_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawBoxNormals(drawList, boxCenter(5, row), IDENTITY_BASIS, BOX_SIZE, { color: TEAL, width: BOX_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // box_s(solid): the reference also overlays the normal-aware wireframe.
  for (let row = 0; row < BOX_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * BOX_S_TUNNEL_SCALE_STEP;
    const hue = row / BOX_S_SAMPLE_COUNT + 0.6;
    const center = boxTunnelCenter(6, row, BOX_S_TUNNEL_Y, BOX_S_TUNNEL_DEPTH_STEP);
    const basis = boxSolidBasis(row);
    const size = scaleVec(BOX_S_TUNNEL_SIZE, scale);
    drawList.mesh(transformMeshByBasis(box(size), center, basis), { color: fromHsv(hue, 0.7, 1, 0.35), solid: true });
    drawBox(drawList, center, basis, size, { color: fromHsv(hue, 0.7, 1, 1), width: BOX_BASE_LINE_WIDTH });
  }
}
