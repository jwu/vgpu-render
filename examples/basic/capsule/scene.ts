/**
 * `capsule`: capsule wire meshes across width, radius, half height, segment, rotation, joint and normal rows.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { CAPSULE_BASE_LINE_WIDTH, CAPSULE_BASE_Y, CAPSULE_HALF_HEIGHT, CAPSULE_HALF_HEIGHT_VALUES, CAPSULE_JOINT_LINE_WIDTH, CAPSULE_JOINT_SEGMENT_COUNT, CAPSULE_JOINT_SIDE_SEGMENT_COUNT, CAPSULE_LAYOUT, CAPSULE_RADIUS, CAPSULE_RADIUS_VALUES, CAPSULE_ROTATION_TUNNEL_DEPTH_STEP, CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT, CAPSULE_ROTATION_TUNNEL_RADIUS, CAPSULE_ROTATION_TUNNEL_SCALE_STEP, CAPSULE_ROTATION_TUNNEL_Y, CAPSULE_SEGMENT_COUNT, CAPSULE_SIDE_SEGMENT_COUNT, CAPSULE_SIDE_SEGMENT_VALUES, capsuleCenter, capsuleColumnHalfHeight, capsuleColumnRadius, capsuleTunnelBasis, capsuleTunnelCenter, capsuleWireAt } from "../../shared/shapes-3d.js";
import { CYAN, GOLD, IDENTITY_BASIS, LIME, PINK, TEAL, VIOLET, WHITE, capsuleWireNormals, drawShapeWire } from "../../shared/base-3d.js";
import type { ShapeWire } from "../../../src/geometry-generators.js";
import type { LineOptions } from "../../../src/frame-draw-list.js";
import { JOINT_VALUES, NORMAL_SAMPLE_COUNT, ROTATION_SAMPLE_COUNT, SEGMENT_VALUES, WIDTH_VALUES, normalSampleColor, normalSampleWidth } from "../../shared/layout-3d.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(drawList, shape, options);
  const base = (column: number, row: number, segments = CAPSULE_SEGMENT_COUNT, sideSegments = CAPSULE_SIDE_SEGMENT_COUNT): ShapeWire =>
    capsuleWireAt(capsuleColumnRadius(column, row), capsuleColumnHalfHeight(column, row), segments, sideSegments, capsuleCenter(column, row), IDENTITY_BASIS);
  const wireNormal = (column: number, row: number, options: LineOptions, segments = CAPSULE_SEGMENT_COUNT, sideSegments = CAPSULE_SIDE_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, sideSegments);
    drawShapeWire(drawList, shape, options, capsuleWireNormals(shape, capsuleColumnHalfHeight(column, row), capsuleCenter(column, row), IDENTITY_BASIS));
  };

  // capsule(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // capsule(radius)
  CAPSULE_RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(half height)
  CAPSULE_HALF_HEIGHT_VALUES.forEach((_halfHeight, row) => wire(base(2, row), { color: LIME, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(segments)
  SEGMENT_VALUES.forEach((segments, row) => wire(base(3, row, segments), { color: GOLD, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(side segments)
  CAPSULE_SIDE_SEGMENT_VALUES.forEach((sideSegments, row) => wire(base(4, row, CAPSULE_SEGMENT_COUNT, sideSegments), { color: PINK, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CAPSULE_ROTATION_TUNNEL_SCALE_STEP;
    const shape = capsuleWireAt(CAPSULE_ROTATION_TUNNEL_RADIUS * scale, CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT * scale, CAPSULE_SEGMENT_COUNT, CAPSULE_SIDE_SEGMENT_COUNT, capsuleTunnelCenter(5, row, CAPSULE_ROTATION_TUNNEL_Y, CAPSULE_ROTATION_TUNNEL_DEPTH_STEP), capsuleTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: CAPSULE_BASE_LINE_WIDTH });
  }
  // capsule(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, CAPSULE_JOINT_SEGMENT_COUNT, CAPSULE_JOINT_SIDE_SEGMENT_COUNT), { color: VIOLET, width: CAPSULE_JOINT_LINE_WIDTH, joint }));
  // capsule_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(7, row, { color: normalSampleColor(row), width: normalSampleWidth(row, CAPSULE_BASE_LINE_WIDTH), joint: "round" });
  }
  // capsule_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(8, row, { color: TEAL, width: CAPSULE_JOINT_LINE_WIDTH, joint }, CAPSULE_JOINT_SEGMENT_COUNT, CAPSULE_JOINT_SIDE_SEGMENT_COUNT));
}
