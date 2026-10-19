/**
 * `axes`: axis length, width, rotation, and normal-aware axis variants.
 */

import { AXES_LAYOUT, AXES_LENGTH, AXES_LENGTH_VALUES, AXES_ROTATION_TUNNEL_LENGTH, AXES_ROTATION_TUNNEL_SCALE_STEP, IDENTITY_BASIS, axesRotationTunnelBasis, axesTunnelPos, drawAxes, drawAxesN } from "../../shared/draw-3d.js";
import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { ROTATION_SAMPLE_COUNT, WIDTH_VALUES } from "../../shared/layout-3d.js";

const AXES_BASE_WIDTH = 2;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  AXES_LENGTH_VALUES.forEach((length, row) => {
    drawAxes(drawList, AXES_LAYOUT.at(0, row), IDENTITY_BASIS, length, AXES_BASE_WIDTH);
  });
  WIDTH_VALUES.forEach((width, row) => {
    drawAxes(drawList, AXES_LAYOUT.at(1, row), IDENTITY_BASIS, AXES_LENGTH, width);
  });
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * AXES_ROTATION_TUNNEL_SCALE_STEP;
    drawAxes(drawList, axesTunnelPos(2, row), axesRotationTunnelBasis(row), AXES_ROTATION_TUNNEL_LENGTH * scale, AXES_BASE_WIDTH);
  }
  AXES_LENGTH_VALUES.forEach((length, row) => {
    drawAxesN(drawList, AXES_LAYOUT.at(3, row), IDENTITY_BASIS, length, AXES_BASE_WIDTH);
  });
  WIDTH_VALUES.forEach((width, row) => {
    drawAxesN(drawList, AXES_LAYOUT.at(4, row), IDENTITY_BASIS, AXES_LENGTH, width);
  });
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * AXES_ROTATION_TUNNEL_SCALE_STEP;
    drawAxesN(drawList, axesTunnelPos(5, row), axesRotationTunnelBasis(row), AXES_ROTATION_TUNNEL_LENGTH * scale, AXES_BASE_WIDTH);
  }
  void context;
}
