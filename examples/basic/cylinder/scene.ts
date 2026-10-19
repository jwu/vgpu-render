/**
 * `cylinder`: cylinder wire and solid meshes across width, radius, half height, segment, rotation, joint and normal rows.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { CYLINDER_BASE_LINE_WIDTH, CYLINDER_BASE_Y, CYLINDER_HALF_HEIGHT, CYLINDER_HALF_HEIGHT_VALUES, CYLINDER_JOINT_LINE_WIDTH, CYLINDER_JOINT_SEGMENT_COUNT, CYLINDER_JOINT_SIDE_SEGMENT_COUNT, CYLINDER_LAYOUT, CYLINDER_RADIUS, CYLINDER_ROTATION_TUNNEL_DEPTH_STEP, CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT, CYLINDER_ROTATION_TUNNEL_RADIUS, CYLINDER_ROTATION_TUNNEL_SCALE_STEP, CYLINDER_ROTATION_TUNNEL_Y, CYLINDER_SEGMENT_COUNT, CYLINDER_SIDE_SEGMENT_COUNT, CYLINDER_S_SAMPLE_COUNT, CYLINDER_S_TUNNEL_DEPTH_STEP, CYLINDER_S_TUNNEL_HALF_HEIGHT, CYLINDER_S_TUNNEL_RADIUS, CYLINDER_S_TUNNEL_SCALE_STEP, CYLINDER_S_TUNNEL_Y, SHAPE_SEGMENT_VALUES, cylinderCenter, cylinderColumnHalfHeight, cylinderColumnRadius, cylinderTunnelBasis, cylinderTunnelCenter, cylinderWireAt } from "../../shared/shapes-3d.js";
import { CYAN, GOLD, IDENTITY_BASIS, LIME, ORANGE_FULL, TEAL, VIOLET, WHITE, cylinderSolidMesh, cylinderWireNormals, drawShapeWire } from "../../shared/base-3d.js";
import type { ShapeWire } from "../../../src/geometry-generators.js";
import type { LineOptions } from "../../../src/frame-draw-list.js";
import { JOINT_VALUES, NORMAL_SAMPLE_COUNT, RADIUS_VALUES, ROTATION_SAMPLE_COUNT, WIDTH_VALUES, fromHsv, normalSampleColor, normalSampleWidth } from "../../shared/layout-3d.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(drawList, shape, options);
  const base = (column: number, row: number, segments = CYLINDER_SEGMENT_COUNT, sideSegments = CYLINDER_SIDE_SEGMENT_COUNT): ShapeWire =>
    cylinderWireAt(cylinderColumnRadius(column, row), cylinderColumnHalfHeight(column, row), segments, sideSegments, cylinderCenter(column, row), IDENTITY_BASIS);
  const wireNormal = (column: number, row: number, options: LineOptions, segments = CYLINDER_SEGMENT_COUNT, sideSegments = CYLINDER_SIDE_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, sideSegments);
    drawShapeWire(drawList, shape, options, cylinderWireNormals(shape, cylinderColumnRadius(column, row), cylinderColumnHalfHeight(column, row), sideSegments, IDENTITY_BASIS));
  };

  // cylinder(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // cylinder(radius)
  RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(half height)
  CYLINDER_HALF_HEIGHT_VALUES.forEach((_halfHeight, row) => wire(base(2, row), { color: LIME, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(segments)
  SHAPE_SEGMENT_VALUES.forEach((segments, row) => wire(base(3, row, segments), { color: GOLD, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(side segments)
  SHAPE_SEGMENT_VALUES.forEach((sideSegments, row) => wire(base(4, row, CYLINDER_SEGMENT_COUNT, sideSegments), { color: ORANGE_FULL, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CYLINDER_ROTATION_TUNNEL_SCALE_STEP;
    const shape = cylinderWireAt(CYLINDER_ROTATION_TUNNEL_RADIUS * scale, CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT * scale, CYLINDER_SEGMENT_COUNT, CYLINDER_SIDE_SEGMENT_COUNT, cylinderTunnelCenter(5, row, CYLINDER_ROTATION_TUNNEL_Y, CYLINDER_ROTATION_TUNNEL_DEPTH_STEP), cylinderTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: CYLINDER_BASE_LINE_WIDTH });
  }
  // cylinder(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, CYLINDER_JOINT_SEGMENT_COUNT, CYLINDER_JOINT_SIDE_SEGMENT_COUNT), { color: VIOLET, width: CYLINDER_JOINT_LINE_WIDTH, joint }));
  // cylinder_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(7, row, { color: normalSampleColor(row), width: normalSampleWidth(row, CYLINDER_BASE_LINE_WIDTH), joint: "round" });
  }
  // cylinder_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(8, row, { color: TEAL, width: CYLINDER_JOINT_LINE_WIDTH, joint }, CYLINDER_JOINT_SEGMENT_COUNT, CYLINDER_JOINT_SIDE_SEGMENT_COUNT));
  // cylinder_s(solid): the reference also overlays the normal-aware wireframe.
  for (let row = 0; row < CYLINDER_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CYLINDER_S_TUNNEL_SCALE_STEP;
    const center = cylinderTunnelCenter(9, row, CYLINDER_S_TUNNEL_Y, CYLINDER_S_TUNNEL_DEPTH_STEP);
    const basis = cylinderTunnelBasis(row);
    const radius = CYLINDER_S_TUNNEL_RADIUS * scale;
    const halfHeight = CYLINDER_S_TUNNEL_HALF_HEIGHT * scale;
    const shape = cylinderWireAt(radius, halfHeight, CYLINDER_SEGMENT_COUNT, CYLINDER_SIDE_SEGMENT_COUNT, center, basis);
    drawList.mesh(cylinderSolidMesh(radius, halfHeight, center, basis), { color: fromHsv(row / CYLINDER_S_SAMPLE_COUNT + 0.6, 0.7, 1, 0.35), solid: true });
    drawShapeWire(drawList, shape, { color: fromHsv(row / CYLINDER_S_SAMPLE_COUNT + 0.6, 0.7, 1, 1), width: CYLINDER_BASE_LINE_WIDTH, joint: "round" }, cylinderWireNormals(shape, radius, halfHeight, CYLINDER_SIDE_SEGMENT_COUNT, basis));
  }
}
