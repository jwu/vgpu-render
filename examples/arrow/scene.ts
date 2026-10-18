/**
 * `arrow`: direction, width, head length, head angle, joints, normal-aware arrows, and arrow-line variants.
 */

import { ARROW_BASE_HEAD_ANGLE, ARROW_DIR_ANGLE_VALUES, ARROW_HEAD_ANGLE_VALUES, ARROW_HEAD_LENGTH, ARROW_HEAD_LENGTH_VALUES, ARROW_JOINT_HEAD_ANGLE, ARROW_JOINT_HEAD_LENGTH, CYAN, DASH_OFFSET_SPEED, GOLD, LIME, ORANGE_FULL, PINK, TEAL, VIOLET, WHITE, arrowDirection, arrowLineEnd, arrowLineStart, arrowTip, drawArrowHead, drawArrowLine, fposmod, type ArrowHeadOptions } from "../shared/draw-3d.js";
import type { FrameDrawList, Vec3 } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { DASH_VALUES, JOINT_VALUES, NORMAL_SAMPLE_COUNT, ROTATION_SAMPLE_COUNT, WIDTH_VALUES, normalSampleColor, normalSampleWidth } from "../shared/layout-3d.js";

const ARROW_BASE_WIDTH = 2;

const ARROW_JOINT_WIDTH = 8;

const ARROW_NORMAL: Vec3 = [0, 0, 1];

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = fposmod(context.time * DASH_OFFSET_SPEED, 10);
  const baseHead: Omit<ArrowHeadOptions, "color" | "width"> = { headAngle: ARROW_BASE_HEAD_ANGLE };
  const jointHead: Omit<ArrowHeadOptions, "color" | "width"> = { headAngle: ARROW_JOINT_HEAD_ANGLE };

  // arrow(width) / arrow(dir) / arrow(head angle) / arrow(joint)
  WIDTH_VALUES.forEach((width, row) => {
    drawArrowHead(drawList, arrowTip(0, row), [ARROW_HEAD_LENGTH, 0, 0], { color: WHITE, width, ...baseHead });
  });
  ARROW_DIR_ANGLE_VALUES.forEach((_angle, row) => {
    drawArrowHead(drawList, arrowTip(1, row), arrowDirection(row), { color: CYAN, width: ARROW_BASE_WIDTH, ...baseHead });
  });
  ARROW_HEAD_ANGLE_VALUES.forEach((headAngle, row) => {
    drawArrowHead(drawList, arrowTip(2, row), [ARROW_HEAD_LENGTH, 0, 0], { color: LIME, width: ARROW_BASE_WIDTH, headAngle });
  });
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowHead(drawList, arrowTip(3, row), [ARROW_JOINT_HEAD_LENGTH, 0, 0], { color: VIOLET, width: ARROW_JOINT_WIDTH, ...jointHead, joint });
  });

  // arrow_n / arrow_n(joint)
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawArrowHead(drawList, arrowTip(4, row), [ARROW_HEAD_LENGTH, 0, 0], { color: normalSampleColor(row), width: normalSampleWidth(row, ARROW_BASE_WIDTH), ...baseHead, normal: ARROW_NORMAL });
  }
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowHead(drawList, arrowTip(5, row), [ARROW_JOINT_HEAD_LENGTH, 0, 0], { color: TEAL, width: ARROW_JOINT_WIDTH, ...jointHead, joint, normal: ARROW_NORMAL });
  });

  // arrow_line(width)
  WIDTH_VALUES.forEach((width, row) => {
    drawArrowLine(drawList, arrowLineStart(6, row), arrowLineEnd(6, row), { color: WHITE, width, headLength: ARROW_HEAD_LENGTH, ...baseHead });
  });
  // arrow_line(head length)
  ARROW_HEAD_LENGTH_VALUES.forEach((headLength, row) => {
    drawArrowLine(drawList, arrowLineStart(7, row), arrowLineEnd(7, row), { color: GOLD, width: ARROW_BASE_WIDTH, headLength, ...baseHead });
  });
  // arrow_line(head angle)
  ARROW_HEAD_ANGLE_VALUES.forEach((headAngle, row) => {
    drawArrowLine(drawList, arrowLineStart(8, row), arrowLineEnd(8, row), { color: VIOLET, width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, headAngle });
  });
  // arrow_line(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    drawArrowLine(drawList, arrowLineStart(9, row), arrowLineEnd(9, row), { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, ...baseHead });
  }
  // arrow_line(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(drawList, arrowLineStart(10, row), arrowLineEnd(10, row), { color: VIOLET, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint });
  });
  // arrow_line_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawArrowLine(drawList, arrowLineStart(11, row), arrowLineEnd(11, row), { color: ORANGE_FULL, width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, ...baseHead, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // arrow_line_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(drawList, arrowLineStart(12, row), arrowLineEnd(12, row), { color: PINK, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] });
  });
  // arrow_line_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawArrowLine(drawList, arrowLineStart(13, row), arrowLineEnd(13, row), { color: normalSampleColor(row), width: normalSampleWidth(row, ARROW_BASE_WIDTH), headLength: ARROW_HEAD_LENGTH, ...baseHead, normal: ARROW_NORMAL });
  }
  // arrow_line_n(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(drawList, arrowLineStart(14, row), arrowLineEnd(14, row), { color: TEAL, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint, normal: ARROW_NORMAL });
  });
  // arrow_line_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawArrowLine(drawList, arrowLineStart(15, row), arrowLineEnd(15, row), { color: TEAL, width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, ...baseHead, normal: ARROW_NORMAL, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // arrow_line_n_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(drawList, arrowLineStart(16, row), arrowLineEnd(16, row), { color: TEAL, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint, normal: ARROW_NORMAL, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] });
  });
}
