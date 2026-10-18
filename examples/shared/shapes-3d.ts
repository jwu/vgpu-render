/**
 * Sphere, cone, cylinder and capsule reference scenes, shared by their pages and the index matrix.
 */

export * from "./base-3d.js";

import { CYAN, DASH_OFFSET_SPEED, GOLD, IDENTITY_BASIS, LIME, ORANGE_FULL, PINK, TEAL, VIOLET, WHITE, capsuleWireNormals, coneSolidMesh, coneWireNormals, cylinderSolidMesh, cylinderWireNormals, drawShapeWire, fposmod, rotateBasis, sphereSolidMesh, sphereWireNormals, type Basis3, type SceneContext } from "./base-3d.js";
import { capsuleWire, coneWire, cylinderWire, sphereRingNormals, sphereWire, type ShapeWire } from "../../src/geometry-generators.js";
import type { FrameDrawList, LineOptions, Vec3 } from "../../src/frame-draw-list.js";
import { DASH_VALUES, JOINT_VALUES, NORMAL_SAMPLE_COUNT, RADIUS_VALUES, ROTATION_SAMPLE_COUNT, SCENE_LAYOUTS, SEGMENT_VALUES, WIDTH_VALUES, createLayout, fromHsv, normalSampleColor, normalSampleWidth, referenceOffset } from "./layout-3d.js";


/** Only the cone/cylinder segment tables differ from the shared sphere values. */
export const SHAPE_SEGMENT_VALUES = [3, 4, 8, 16] as const;

export function shapeScene(drawList: FrameDrawList, id: string, context: SceneContext): void {
  if (id === "sphere") sphereShape(drawList, context);
  else if (id === "cone") coneShape(drawList);
  else if (id === "cylinder") cylinderShape(drawList);
  else capsuleShape(drawList);
}


// --- Sphere ---------------------------------------------------------------

export const SPHERE_LAYOUT = createLayout(SCENE_LAYOUTS.sphere, SCENE_LAYOUTS.sphere.baseY);

export const SPHERE_BASE_Y = SCENE_LAYOUTS.sphere.baseY;

export const SPHERE_RADIUS = 0.30;

export const SPHERE_BASE_LINE_WIDTH = 2;

export const SPHERE_JOINT_LINE_WIDTH = 8;

export const SPHERE_SEGMENT_COUNT = 48;

export const SPHERE_JOINT_SEGMENT_COUNT = 16;

export const SPHERE_AXIS_SEGMENT_COUNT = 2;

export const SPHERE_Y_AXIS_SEGMENT_VALUES = [0, 1, 2, 6] as const;

export const SPHERE_Z_AXIS_SEGMENT_VALUES = [0, 1, 2, 6] as const;

export const SPHERE_ROTATION_TUNNEL_RADIUS = 0.42;

export const SPHERE_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const SPHERE_ROTATION_TUNNEL_SCALE_STEP = 0.05;

export const SPHERE_ROTATION_TUNNEL_Y = 0.35;

export const SPHERE_S_SAMPLE_COUNT = 8;

export const SPHERE_S_TUNNEL_RADIUS = 0.42;

export const SPHERE_S_TUNNEL_DEPTH_STEP = 0.16;

export const SPHERE_S_TUNNEL_SCALE_STEP = 0.05;

export const SPHERE_S_TUNNEL_Y = 0.35;


/** `_get_column_radius`: the radius row plus the two shrinking tunnels. */
export function sphereColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 5) return SPHERE_ROTATION_TUNNEL_RADIUS * (1 - row * SPHERE_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 13) return SPHERE_S_TUNNEL_RADIUS * (1 - row * SPHERE_S_TUNNEL_SCALE_STEP);
  return SPHERE_RADIUS;
}


/** `_get_sphere_center`: the sphere rests on `SPHERE_Y`, so its centre rises with the radius. */
export function sphereCenter(column: number, row: number): Vec3 {
  return referenceOffset([SPHERE_LAYOUT.columnX(column), SPHERE_BASE_Y + sphereColumnRadius(column, row), SPHERE_LAYOUT.rowZ(column, row)]);
}

export function sphereTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = sphereCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}


/** `_get_rotation_tunnel_rotation` / `_get_sphere_s_tunnel_rotation` (identical). */
export function sphereTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.35);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}


/** `draw_sphere`: latitude rings (`yAxis`) plus meridian great circles (`zAxis`). */
export function sphereWireAt(radius: number, segments: number, yAxis: number, zAxis: number, center: Vec3, basis: Basis3): ShapeWire {
  return sphereWire(radius, segments, yAxis, zAxis, center, basis);
}

export function sphereShape(drawList: FrameDrawList, context: SceneContext): void {
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


// --- Cone -----------------------------------------------------------------

export const CONE_LAYOUT = createLayout(SCENE_LAYOUTS.cone, SCENE_LAYOUTS.cone.baseY);

export const CONE_BASE_Y = SCENE_LAYOUTS.cone.baseY;

export const CONE_RADIUS = 0.28;

export const CONE_HEIGHT = 0.7;

export const CONE_BASE_LINE_WIDTH = 2;

export const CONE_JOINT_LINE_WIDTH = 8;

export const CONE_SEGMENT_COUNT = 16;

export const CONE_SIDE_SEGMENT_COUNT = 8;

export const CONE_JOINT_SEGMENT_COUNT = 8;

export const CONE_JOINT_SIDE_SEGMENT_COUNT = 8;

export const CONE_HEIGHT_VALUES = [0.45, 0.65, 0.85, 1.05] as const;

export const CONE_ROTATION_TUNNEL_RADIUS = 0.34;

export const CONE_ROTATION_TUNNEL_HEIGHT = 0.82;

export const CONE_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const CONE_ROTATION_TUNNEL_SCALE_STEP = 0.05;

export const CONE_ROTATION_TUNNEL_Y = 0.35;

export const CONE_S_SAMPLE_COUNT = 8;

export const CONE_S_TUNNEL_RADIUS = 0.34;

export const CONE_S_TUNNEL_HEIGHT = 0.82;

export const CONE_S_TUNNEL_DEPTH_STEP = 0.16;

export const CONE_S_TUNNEL_SCALE_STEP = 0.05;

export const CONE_S_TUNNEL_Y = 0.35;


/** `_get_column_radius`: the radius row plus the rotation/solid tunnels. */
export function coneColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 5) return CONE_ROTATION_TUNNEL_RADIUS * (1 - row * CONE_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CONE_S_TUNNEL_RADIUS * (1 - row * CONE_S_TUNNEL_SCALE_STEP);
  return CONE_RADIUS;
}


/** `_get_column_height`: the height row plus the rotation/solid tunnels. */
export function coneColumnHeight(column: number, row: number): number {
  if (column === 2) return CONE_HEIGHT_VALUES[row]!;
  if (column === 5) return CONE_ROTATION_TUNNEL_HEIGHT * (1 - row * CONE_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CONE_S_TUNNEL_HEIGHT * (1 - row * CONE_S_TUNNEL_SCALE_STEP);
  return CONE_HEIGHT;
}


/** `_get_cone_center`: the cone base stays at `CONE_BASE_Y`, so the centre rises with half the height. */
export function coneCenter(column: number, row: number): Vec3 {
  return referenceOffset([CONE_LAYOUT.columnX(column), CONE_BASE_Y + coneColumnHeight(column, row) * 0.5, CONE_LAYOUT.rowZ(column, row)]);
}

export function coneTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = coneCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}


/** `_get_rotation_tunnel_rotation` / `_get_cone_s_tunnel_rotation` (identical). */
export function coneTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.26);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

export function coneWireAt(radius: number, height: number, segments: number, sideSegments: number, center: Vec3, basis: Basis3): ShapeWire {
  return coneWire(radius, height, segments, sideSegments, center, basis);
}

export function coneShape(drawList: FrameDrawList): void {
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


// --- Cylinder -------------------------------------------------------------

export const CYLINDER_LAYOUT = createLayout(SCENE_LAYOUTS.cylinder, SCENE_LAYOUTS.cylinder.baseY);

export const CYLINDER_BASE_Y = SCENE_LAYOUTS.cylinder.baseY;

export const CYLINDER_RADIUS = 0.28;

export const CYLINDER_HALF_HEIGHT = 0.35;

export const CYLINDER_BASE_LINE_WIDTH = 2;

export const CYLINDER_JOINT_LINE_WIDTH = 8;

export const CYLINDER_SEGMENT_COUNT = 16;

export const CYLINDER_SIDE_SEGMENT_COUNT = 8;

export const CYLINDER_JOINT_SEGMENT_COUNT = 8;

export const CYLINDER_JOINT_SIDE_SEGMENT_COUNT = 8;

export const CYLINDER_HALF_HEIGHT_VALUES = [0.225, 0.325, 0.425, 0.525] as const;

export const CYLINDER_ROTATION_TUNNEL_RADIUS = 0.34;

export const CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT = 0.41;

export const CYLINDER_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const CYLINDER_ROTATION_TUNNEL_SCALE_STEP = 0.05;

export const CYLINDER_ROTATION_TUNNEL_Y = 0.35;

export const CYLINDER_S_SAMPLE_COUNT = 8;

export const CYLINDER_S_TUNNEL_RADIUS = 0.34;

export const CYLINDER_S_TUNNEL_HALF_HEIGHT = 0.41;

export const CYLINDER_S_TUNNEL_DEPTH_STEP = 0.16;

export const CYLINDER_S_TUNNEL_SCALE_STEP = 0.05;

export const CYLINDER_S_TUNNEL_Y = 0.35;


/** `_get_column_radius`: the radius row plus the rotation/solid tunnels. */
export function cylinderColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 5) return CYLINDER_ROTATION_TUNNEL_RADIUS * (1 - row * CYLINDER_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CYLINDER_S_TUNNEL_RADIUS * (1 - row * CYLINDER_S_TUNNEL_SCALE_STEP);
  return CYLINDER_RADIUS;
}


/** `_get_column_half_height`: the half-height row plus the rotation/solid tunnels. */
export function cylinderColumnHalfHeight(column: number, row: number): number {
  if (column === 2) return CYLINDER_HALF_HEIGHT_VALUES[row]!;
  if (column === 5) return CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT * (1 - row * CYLINDER_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CYLINDER_S_TUNNEL_HALF_HEIGHT * (1 - row * CYLINDER_S_TUNNEL_SCALE_STEP);
  return CYLINDER_HALF_HEIGHT;
}


/** `_get_cylinder_center`: the cylinder base stays at `CYLINDER_BASE_Y`. */
export function cylinderCenter(column: number, row: number): Vec3 {
  return referenceOffset([CYLINDER_LAYOUT.columnX(column), CYLINDER_BASE_Y + cylinderColumnHalfHeight(column, row), CYLINDER_LAYOUT.rowZ(column, row)]);
}

export function cylinderTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = cylinderCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}


/** `_get_rotation_tunnel_rotation` / `_get_cylinder_s_tunnel_rotation` (identical). */
export function cylinderTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.26);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

export function cylinderWireAt(radius: number, halfHeight: number, segments: number, sideSegments: number, center: Vec3, basis: Basis3): ShapeWire {
  return cylinderWire(radius, halfHeight, segments, sideSegments, center, basis);
}

export function cylinderShape(drawList: FrameDrawList): void {
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


// --- Capsule --------------------------------------------------------------

export const CAPSULE_LAYOUT = createLayout(SCENE_LAYOUTS.capsule, SCENE_LAYOUTS.capsule.baseY);

export const CAPSULE_BASE_Y = SCENE_LAYOUTS.capsule.baseY;

export const CAPSULE_RADIUS = 0.28;

export const CAPSULE_HALF_HEIGHT = 0.225;

export const CAPSULE_BASE_LINE_WIDTH = 2;

export const CAPSULE_JOINT_LINE_WIDTH = 8;

export const CAPSULE_SEGMENT_COUNT = 32;

export const CAPSULE_SIDE_SEGMENT_COUNT = 2;

export const CAPSULE_JOINT_SEGMENT_COUNT = 12;

export const CAPSULE_JOINT_SIDE_SEGMENT_COUNT = 4;

export const CAPSULE_RADIUS_VALUES = [0.16, 0.24, 0.32, 0.40] as const;

export const CAPSULE_HALF_HEIGHT_VALUES = [0.0, 0.125, 0.225, 0.35] as const;

export const CAPSULE_SIDE_SEGMENT_VALUES = [1, 2, 4, 8] as const;

export const CAPSULE_ROTATION_TUNNEL_RADIUS = 0.34;

export const CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT = 0.275;

export const CAPSULE_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const CAPSULE_ROTATION_TUNNEL_SCALE_STEP = 0.05;

export const CAPSULE_ROTATION_TUNNEL_Y = 0.35;


/** `_get_column_radius`: the radius row plus the rotation tunnel. */
export function capsuleColumnRadius(column: number, row: number): number {
  if (column === 1) return CAPSULE_RADIUS_VALUES[row]!;
  if (column === 5) return CAPSULE_ROTATION_TUNNEL_RADIUS * (1 - row * CAPSULE_ROTATION_TUNNEL_SCALE_STEP);
  return CAPSULE_RADIUS;
}


/** `_get_column_half_height`: the half-height row plus the rotation tunnel. */
export function capsuleColumnHalfHeight(column: number, row: number): number {
  if (column === 2) return CAPSULE_HALF_HEIGHT_VALUES[row]!;
  if (column === 5) return CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT * (1 - row * CAPSULE_ROTATION_TUNNEL_SCALE_STEP);
  return CAPSULE_HALF_HEIGHT;
}


/** `_get_capsule_center`: base at `CAPSULE_BASE_Y`, so the centre rises by half height plus radius. */
export function capsuleCenter(column: number, row: number): Vec3 {
  const y = CAPSULE_BASE_Y + capsuleColumnHalfHeight(column, row) + capsuleColumnRadius(column, row);
  return referenceOffset([CAPSULE_LAYOUT.columnX(column), y, CAPSULE_LAYOUT.rowZ(column, row)]);
}

export function capsuleTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = capsuleCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}


/** `_get_rotation_tunnel_rotation`. */
export function capsuleTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.28);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

export function capsuleWireAt(radius: number, halfHeight: number, segments: number, sideSegments: number, center: Vec3, basis: Basis3): ShapeWire {
  return capsuleWire(radius, halfHeight, segments, sideSegments, center, basis);
}

export function capsuleShape(drawList: FrameDrawList): void {
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
