/**
 * `cone`: cone wire and solid meshes across width, radius, height, segment, rotation, joint and normal rows.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { CONE_BASE_LINE_WIDTH, CONE_BASE_Y, CONE_HEIGHT, CONE_HEIGHT_VALUES, CONE_JOINT_LINE_WIDTH, CONE_JOINT_SEGMENT_COUNT, CONE_JOINT_SIDE_SEGMENT_COUNT, CONE_LAYOUT, CONE_RADIUS, CONE_ROTATION_TUNNEL_DEPTH_STEP, CONE_ROTATION_TUNNEL_HEIGHT, CONE_ROTATION_TUNNEL_RADIUS, CONE_ROTATION_TUNNEL_SCALE_STEP, CONE_ROTATION_TUNNEL_Y, CONE_SEGMENT_COUNT, CONE_SIDE_SEGMENT_COUNT, CONE_S_SAMPLE_COUNT, CONE_S_TUNNEL_DEPTH_STEP, CONE_S_TUNNEL_HEIGHT, CONE_S_TUNNEL_RADIUS, CONE_S_TUNNEL_SCALE_STEP, CONE_S_TUNNEL_Y, SHAPE_SEGMENT_VALUES, coneCenter, coneColumnHeight, coneColumnRadius, coneTunnelBasis, coneTunnelCenter, coneWireAt } from "../../shared/shapes-3d.js";
import { CYAN, GOLD, IDENTITY_BASIS, LIME, ORANGE_FULL, TEAL, VIOLET, WHITE, coneSolidMesh, coneWireNormals, drawShapeWire } from "../../shared/base-3d.js";
import type { ShapeWire } from "../../../src/geometry-generators.js";
import type { LineOptions } from "../../../src/frame-draw-list.js";
import { JOINT_VALUES, NORMAL_SAMPLE_COUNT, RADIUS_VALUES, ROTATION_SAMPLE_COUNT, WIDTH_VALUES, fromHsv, normalSampleColor, normalSampleWidth } from "../../shared/layout-3d.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(drawList, shape, options);
  const base = (column: number, row: number, segments = CONE_SEGMENT_COUNT, sideSegments = CONE_SIDE_SEGMENT_COUNT): ShapeWire =>
    coneWireAt(coneColumnRadius(column, row), coneColumnHeight(column, row), segments, sideSegments, coneCenter(column, row), IDENTITY_BASIS);
  const wireNormal = (column: number, row: number, options: LineOptions, segments = CONE_SEGMENT_COUNT, sideSegments = CONE_SIDE_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, sideSegments);
    drawShapeWire(drawList, shape, options, coneWireNormals(shape, coneColumnRadius(column, row), coneColumnHeight(column, row), sideSegments, IDENTITY_BASIS));
  };

  // cone(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // cone(radius)
  RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: CONE_BASE_LINE_WIDTH }));
  // cone(height)
  CONE_HEIGHT_VALUES.forEach((_height, row) => wire(base(2, row), { color: LIME, width: CONE_BASE_LINE_WIDTH }));
  // cone(segments)
  SHAPE_SEGMENT_VALUES.forEach((segments, row) => wire(base(3, row, segments), { color: GOLD, width: CONE_BASE_LINE_WIDTH }));
  // cone(side segments)
  SHAPE_SEGMENT_VALUES.forEach((sideSegments, row) => wire(base(4, row, CONE_SEGMENT_COUNT, sideSegments), { color: ORANGE_FULL, width: CONE_BASE_LINE_WIDTH }));
  // cone(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CONE_ROTATION_TUNNEL_SCALE_STEP;
    const shape = coneWireAt(CONE_ROTATION_TUNNEL_RADIUS * scale, CONE_ROTATION_TUNNEL_HEIGHT * scale, CONE_SEGMENT_COUNT, CONE_SIDE_SEGMENT_COUNT, coneTunnelCenter(5, row, CONE_ROTATION_TUNNEL_Y, CONE_ROTATION_TUNNEL_DEPTH_STEP), coneTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: CONE_BASE_LINE_WIDTH });
  }
  // cone(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, CONE_JOINT_SEGMENT_COUNT, CONE_JOINT_SIDE_SEGMENT_COUNT), { color: VIOLET, width: CONE_JOINT_LINE_WIDTH, joint }));
  // cone_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(7, row, { color: normalSampleColor(row), width: normalSampleWidth(row, CONE_BASE_LINE_WIDTH), joint: "round" });
  }
  // cone_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(8, row, { color: TEAL, width: CONE_JOINT_LINE_WIDTH, joint }, CONE_JOINT_SEGMENT_COUNT, CONE_JOINT_SIDE_SEGMENT_COUNT));
  // cone_s(solid): the reference also overlays the normal-aware wireframe.
  for (let row = 0; row < CONE_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CONE_S_TUNNEL_SCALE_STEP;
    const center = coneTunnelCenter(9, row, CONE_S_TUNNEL_Y, CONE_S_TUNNEL_DEPTH_STEP);
    const basis = coneTunnelBasis(row);
    const radius = CONE_S_TUNNEL_RADIUS * scale;
    const height = CONE_S_TUNNEL_HEIGHT * scale;
    const shape = coneWireAt(radius, height, CONE_SEGMENT_COUNT, CONE_SIDE_SEGMENT_COUNT, center, basis);
    drawList.mesh(coneSolidMesh(radius, height, center, basis), { color: fromHsv(row / CONE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 0.35), solid: true });
    drawShapeWire(drawList, shape, { color: fromHsv(row / CONE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 1), width: CONE_BASE_LINE_WIDTH, joint: "round" }, coneWireNormals(shape, radius, height, CONE_SIDE_SEGMENT_COUNT, basis));
  }
}
