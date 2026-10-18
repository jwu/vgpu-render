/**
 * Shared layout data and geometry helpers for the sphere, cone, cylinder and capsule pages.
 *
 * The drawing loops live in each page's `scene.ts`; this module keeps the layout constants
 * and position helpers they share with the label specs.
 */

export * from "./base-3d.js";

import { IDENTITY_BASIS, rotateBasis, type Basis3 } from "./base-3d.js";
import { capsuleWire, coneWire, cylinderWire, sphereWire, type ShapeWire } from "../../src/geometry-generators.js";
import type { Vec3 } from "../../src/frame-draw-list.js";
import { RADIUS_VALUES, SCENE_LAYOUTS, createLayout, referenceOffset } from "./layout-3d.js";

export const SHAPE_SEGMENT_VALUES = [3, 4, 8, 16] as const;



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
