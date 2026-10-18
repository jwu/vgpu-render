/**
 * `sphere`: sphere wire and solid meshes across width, radius, segment, axis, dash, joint and normal rows.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { SPHERE_AXIS_SEGMENT_COUNT, SPHERE_BASE_LINE_WIDTH, SPHERE_BASE_Y, SPHERE_JOINT_LINE_WIDTH, SPHERE_JOINT_SEGMENT_COUNT, SPHERE_LAYOUT, SPHERE_RADIUS, SPHERE_ROTATION_TUNNEL_DEPTH_STEP, SPHERE_ROTATION_TUNNEL_RADIUS, SPHERE_ROTATION_TUNNEL_SCALE_STEP, SPHERE_ROTATION_TUNNEL_Y, SPHERE_SEGMENT_COUNT, SPHERE_S_SAMPLE_COUNT, SPHERE_S_TUNNEL_DEPTH_STEP, SPHERE_S_TUNNEL_RADIUS, SPHERE_S_TUNNEL_SCALE_STEP, SPHERE_S_TUNNEL_Y, SPHERE_Y_AXIS_SEGMENT_VALUES, SPHERE_Z_AXIS_SEGMENT_VALUES, sphereCenter, sphereColumnRadius, sphereTunnelBasis, sphereTunnelCenter, sphereWireAt } from "../shared/shapes-3d.js";
import { CYAN, DASH_OFFSET_SPEED, GOLD, IDENTITY_BASIS, LIME, ORANGE_FULL, PINK, TEAL, VIOLET, WHITE, drawShapeWire, fposmod, sphereSolidMesh, sphereWireNormals } from "../shared/base-3d.js";
import { sphereRingNormals, type ShapeWire } from "../../src/geometry-generators.js";
import type { LineOptions } from "../../src/frame-draw-list.js";
import { DASH_VALUES, JOINT_VALUES, NORMAL_SAMPLE_COUNT, RADIUS_VALUES, ROTATION_SAMPLE_COUNT, SEGMENT_VALUES, WIDTH_VALUES, fromHsv, normalSampleColor, normalSampleWidth } from "../shared/layout-3d.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = context.time * DASH_OFFSET_SPEED;
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(drawList, shape, options);
  const base = (column: number, row: number, segments = SPHERE_SEGMENT_COUNT, yAxis = SPHERE_AXIS_SEGMENT_COUNT, zAxis = SPHERE_AXIS_SEGMENT_COUNT): ShapeWire =>
    sphereWireAt(sphereColumnRadius(column, row), segments, yAxis, zAxis, sphereCenter(column, row), IDENTITY_BASIS);
  // `draw_sphere_n`: every ring (latitude ring and great circle alike) is shaded from the
  // sphere centre, which is exactly what `_get_sphere_ring_normals` computes.
  const wireNormal = (column: number, row: number, options: LineOptions, segments = SPHERE_SEGMENT_COUNT, yAxis = SPHERE_AXIS_SEGMENT_COUNT, zAxis = SPHERE_AXIS_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, yAxis, zAxis);
    const center = sphereCenter(column, row);
    drawShapeWire(drawList, shape, options, { loops: shape.loops.map((loop) => sphereRingNormals(center, loop)) });
  };

  // sphere(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // sphere(radius)
  RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(segments)
  SEGMENT_VALUES.forEach((segments, row) => wire(base(2, row, segments), { color: LIME, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(y axis)
  SPHERE_Y_AXIS_SEGMENT_VALUES.forEach((yAxis, row) => wire(base(3, row, SPHERE_SEGMENT_COUNT, yAxis), { color: GOLD, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(z axis)
  SPHERE_Z_AXIS_SEGMENT_VALUES.forEach((zAxis, row) => wire(base(4, row, SPHERE_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, zAxis), { color: ORANGE_FULL, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * SPHERE_ROTATION_TUNNEL_SCALE_STEP;
    const shape = sphereWireAt(SPHERE_ROTATION_TUNNEL_RADIUS * scale, SPHERE_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, sphereTunnelCenter(5, row, SPHERE_ROTATION_TUNNEL_Y, SPHERE_ROTATION_TUNNEL_DEPTH_STEP), sphereTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: SPHERE_BASE_LINE_WIDTH });
  }
  // sphere(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, SPHERE_JOINT_SEGMENT_COUNT), { color: VIOLET, width: SPHERE_JOINT_LINE_WIDTH, joint }));
  // sphere_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => wire(base(7, row), { color: ORANGE_FULL, width: SPHERE_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] }));
  // sphere_d(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(8, row, SPHERE_JOINT_SEGMENT_COUNT), { color: PINK, width: SPHERE_JOINT_LINE_WIDTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] }));
  // sphere_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(9, row, { color: normalSampleColor(row), width: normalSampleWidth(row, SPHERE_BASE_LINE_WIDTH), joint: "round" });
  }
  // sphere_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(10, row, { color: TEAL, width: SPHERE_JOINT_LINE_WIDTH, joint }, SPHERE_JOINT_SEGMENT_COUNT));
  // sphere_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => wireNormal(11, row, { color: TEAL, width: SPHERE_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)], joint: "round" }));
  // sphere_n_d(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(12, row, { color: TEAL, width: SPHERE_JOINT_LINE_WIDTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] }, SPHERE_JOINT_SEGMENT_COUNT));
  // sphere_s(solid): the reference draws the `SphereMesh` and overlays the wireframe.
  for (let row = 0; row < SPHERE_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * SPHERE_S_TUNNEL_SCALE_STEP;
    const center = sphereTunnelCenter(13, row, SPHERE_S_TUNNEL_Y, SPHERE_S_TUNNEL_DEPTH_STEP);
    const basis = sphereTunnelBasis(row);
    const radius = SPHERE_S_TUNNEL_RADIUS * scale;
    const shape = sphereWireAt(radius, SPHERE_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, center, basis);
    drawList.mesh(sphereSolidMesh(radius, center, basis), { color: fromHsv(row / SPHERE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 0.35), solid: true });
    drawShapeWire(drawList, shape, { color: fromHsv(row / SPHERE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 1), width: SPHERE_BASE_LINE_WIDTH }, sphereWireNormals(center, shape));
  }
}
