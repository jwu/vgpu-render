/**
 * `arc`: width, radius, angle, segments, rotation, joints, dashes, and normal variants.
 */

import { ARC_ANGLE, ARC_ANGLE_VALUES, ARC_JOINT_SEGMENT_COUNT, ARC_LAYOUT, ARC_RADIUS, ARC_SEGMENT_COUNT, ARC_TUNNEL_RADIUS, ARC_TUNNEL_SCALE_STEP, CYAN, DASH_OFFSET_SPEED, FLAT_BASIS, GOLD, LIME, ORANGE_FULL, PINK, TEAL, VIOLET, WHITE, arcPoints, arcTunnelBasis, arcTunnelCenter, drawArcNormals, fposmod } from "../shared/draw-3d.js";
import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { DASH_VALUES, JOINT_VALUES, NORMAL_SAMPLE_COUNT, RADIUS_VALUES, ROTATION_SAMPLE_COUNT, SEGMENT_VALUES, WIDTH_VALUES, normalSampleColor, normalSampleWidth } from "../shared/layout-3d.js";

const ARC_BASE_LINE_WIDTH = 2;

const ARC_EMPHASIS_LINE_WIDTH = 8;

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = fposmod(context.time * DASH_OFFSET_SPEED, 10);

  // arc(width)
  WIDTH_VALUES.forEach((width, row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(0, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: WHITE, width }, false);
  });
  // arc(radius)
  RADIUS_VALUES.forEach((radius, row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(1, row), radius, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: CYAN, width: ARC_BASE_LINE_WIDTH }, false);
  });
  // arc(angle)
  ARC_ANGLE_VALUES.forEach((angle, row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(2, row), ARC_RADIUS, angle, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: LIME, width: ARC_BASE_LINE_WIDTH }, false);
  });
  // arc(segments)
  SEGMENT_VALUES.forEach((segments, row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(3, row), ARC_RADIUS, ARC_ANGLE, segments, FLAT_BASIS), { color: GOLD, width: ARC_BASE_LINE_WIDTH }, false);
  });
  // arc(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * ARC_TUNNEL_SCALE_STEP;
    drawList.lineStrip(arcPoints(arcTunnelCenter(4, row), ARC_TUNNEL_RADIUS * scale, ARC_ANGLE, ARC_SEGMENT_COUNT, arcTunnelBasis(row)), { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: ARC_BASE_LINE_WIDTH }, false);
  }
  // arc(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(5, row), ARC_RADIUS, ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS), { color: VIOLET, width: ARC_EMPHASIS_LINE_WIDTH, joint }, false);
  });
  // arc_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(6, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: ORANGE_FULL, width: ARC_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] }, false);
  });
  // arc_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawList.lineStrip(arcPoints(ARC_LAYOUT.at(7, row), ARC_RADIUS, ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS), { color: PINK, width: ARC_EMPHASIS_LINE_WIDTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] }, false);
  });
  // arc_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawArcNormals(drawList, arcPoints(ARC_LAYOUT.at(8, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS, { color: normalSampleColor(row), width: normalSampleWidth(row, ARC_BASE_LINE_WIDTH), joint: "round" });
  }
  // arc_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawArcNormals(drawList, arcPoints(ARC_LAYOUT.at(9, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS, { color: TEAL, width: ARC_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)], joint: "round" });
  });
  // arc_n(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArcNormals(drawList, arcPoints(ARC_LAYOUT.at(10, row), ARC_RADIUS, ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS), ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS, { color: TEAL, width: ARC_EMPHASIS_LINE_WIDTH, joint });
  });
}
