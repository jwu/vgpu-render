/**
 * Base layer for the 3D examples: palette, basis helpers and the shape geometry
 * primitives shared by the shape pages and the index matrix.
 */

export type { SceneContext } from "./scene-context.js";

import type { Color, FrameDrawList, LineOptions, Vec3 } from "../../src/frame-draw-list.js";
import { arcNormals, box, boxEdgeNormals, capsuleOutlineNormals, circleNormals, cone, coneBaseBasis, coneSideLineNormals, cylinder, cylinderSideLineNormals, disc, rectNormals, sphere, sphereRingNormals, type MeshData, type ShapeWire } from "../../src/geometry-generators.js";
import { crossVector, normalizeVector, rotateAroundAxis, type CircleBasis } from "./layout-3d.js";
import type { Curve3D } from "../../src/curve.js";

export const WHITE: Color = [1, 1, 1, 1];

export const CYAN: Color = [0.15, 0.85, 1, 0.95];

export const LIME: Color = [0.7, 1, 0.25, 1];

export const ORANGE: Color = [1, 0.45, 0.2, 0.95];

export const VIOLET: Color = [0.75, 0.45, 1, 1];

export const TEAL: Color = [0.25, 0.95, 0.9, 1];

export const GOLD: Color = [0.95, 0.75, 0.25, 1];

export const ORANGE_FULL: Color = [1, 0.45, 0.2, 1];

export const PINK: Color = [1, 0.3, 0.6, 1];

export const AXIS_RED: Color = [1, 0, 0, 1];

export const AXIS_GREEN: Color = [0, 1, 0, 1];

export const AXIS_BLUE: Color = [0, 0, 1, 1];



/** `draw_circle_n`: `_get_circle_normals` gives one radial normal per segment. */
export function drawCircleNormals(drawList: FrameDrawList, points: readonly Vec3[], segments: number, basis: CircleBasis, options: LineOptions): void {
  drawList.lineStrip(points, { ...options, normals: circleNormals(segments, basis) }, true);
}



/** `draw_arc_n`: `_get_arc_normals` gives one radial normal per segment of the sweep. */
export function drawArcNormals(drawList: FrameDrawList, points: readonly Vec3[], angle: number, segments: number, basis: CircleBasis, options: LineOptions): void {
  drawList.lineStrip(points, { ...options, normals: arcNormals(angle, segments, basis) }, false);
}



/** `draw_rect_n`: `_get_rect_normals` gives one corner normal per loop vertex. */
export function drawRectNormals(drawList: FrameDrawList, points: readonly Vec3[], basis: CircleBasis, options: LineOptions): void {
  drawList.lineStrip(points, { ...options, normals: rectNormals(basis) }, true);
}



/** `draw_box_n`: `_get_box_line_normals` gives one normal per edge (see `boxEdgeNormals`). */
export function drawBoxNormals(drawList: FrameDrawList, center: Vec3, basis: Basis3, size: Vec3, options: LineOptions): void {
  const mesh = transformMeshByBasis(box(size), center, basis);
  const normals = boxEdgeNormals(mesh.segments, center, basis);
  mesh.segments.forEach(([a, b], index) => drawList.line(a, b, { ...options, normal: normals[index]! }));
}



/** Reference `_emit_circle_s`: a fan in the circle's own basis, which `disc` builds in its XZ plane. */
export function circleSolidMesh(radius: number, segments: number, center: Vec3, basis: CircleBasis): MeshData {
  const frame: Basis3 = { x: basis.x, y: normalizeVector(crossVector(basis.x, basis.y)), z: basis.y };
  return transformMeshByBasis(disc(radius, segments), center, frame);
}



/** Reference arc/`draw_arc` points: `center + (basis.x*cos + basis.y*sin) * radius`, `segments + 1` samples. */
export function arcPoints(center: Vec3, radius: number, angle: number, segments: number, basis: CircleBasis): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = angle * i / segments;
    const cos = Math.cos(a) * radius;
    const sin = Math.sin(a) * radius;
    points.push([
      center[0] + basis.x[0] * cos + basis.y[0] * sin,
      center[1] + basis.x[1] * cos + basis.y[1] * sin,
      center[2] + basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return points;
}

export function curve(points: readonly { position: Vec3; in?: Vec3; out?: Vec3 }[], closed = false): Curve3D {
  return { points, closed };
}



// ---------------------------------------------------------------------------
// Faithful Rect / Box / Axes reference port.
//
// These three scenes mirror `examples/rect.gd`, `examples/box.gd` and
// `examples/axes.gd`: real column/row coordinates, `Basis` rotations, widths,
// dash offsets and normal-aware axes. `createLayout` applies the same
// `(-10, 0, 1.5)` root translation the capture harness uses.
// ---------------------------------------------------------------------------

export const DASH_OFFSET_SPEED = 0.6;



/** A Godot `Basis` expressed as its three world-space column vectors. */
export type Basis3 = { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };

export const IDENTITY_BASIS: Basis3 = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export function offsetAlong(origin: Vec3, axis: Vec3, amount: number): Vec3 {
  return [origin[0] + axis[0] * amount, origin[1] + axis[1] * amount, origin[2] + axis[2] * amount];
}

export function scaleVec(v: Vec3, factor: number): Vec3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

export function fposmod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}



/** `Basis.rotated(axis, angle)` is `Basis(axis, angle) * basis`, so every column rotates. */
export function rotateBasis(basis: Basis3, axis: Vec3, angle: number): Basis3 {
  return {
    x: rotateAroundAxis(basis.x, axis, angle),
    y: rotateAroundAxis(basis.y, axis, angle),
    z: rotateAroundAxis(basis.z, axis, angle),
  };
}



/** Places an origin-centred mesh through `Basis(basis.x, basis.y, basis.z)` at `position`. */
export function transformMeshByBasis(mesh: MeshData, position: Vec3, basis: Basis3): MeshData {
  const apply = (p: Vec3): Vec3 => [
    position[0] + basis.x[0] * p[0] + basis.y[0] * p[1] + basis.z[0] * p[2],
    position[1] + basis.x[1] * p[0] + basis.y[1] * p[1] + basis.z[1] * p[2],
    position[2] + basis.x[2] * p[0] + basis.y[2] * p[1] + basis.z[2] * p[2],
  ];
  return {
    triangles: mesh.triangles.map(([a, b, c]) => [apply(a), apply(b), apply(c)] as const),
    segments: mesh.segments.map(([a, b]) => [apply(a), apply(b)] as const),
  };
}



// ---------------------------------------------------------------------------
// Faithful Sphere/Cone/Cylinder/Capsule reference ports.
//
// `examples/sphere.gd`, `cone.gd`, `cylinder.gd` and `capsule.gd` share the same
// structure: per-column centres, a rotation tunnel and (except for capsule) a
// solid `*_s` column that draws a `from_hsv` mesh plus the normal-aware
// wireframe. Capsule deliberately has no solid column in the reference.
//
// The wireframe topology is the reference's, not a mesh's: `sphere` emits one latitude
// ring per `y_axis_segment_count` step plus one meridian great circle per
// `z_axis_segment_count` step, `capsule` emits two rings plus `side_segment_count` closed
// silhouettes, `cone`/`cylinder` emit their rings plus `side_segment_count` side lines.
// The generators for that live in `geometry-generators.ts`; this file only places them.
// ---------------------------------------------------------------------------

/**
 * Draws a reference shape wireframe.
 *
 * The reference emits one `draw_line_loop` per ring and a `draw_line_list` for the side
 * lines, so a closed path keeps its joints and its accumulated dash phase; drawing the
 * same points as independent segments would restart the dash pattern per edge.
 */
export function drawShapeWire(drawList: FrameDrawList, shape: ShapeWire, options: LineOptions, normals?: ShapeNormals): void {
  shape.loops.forEach((loop, index) => {
    // Reference `draw_line_loop_n`: each ring joins and dashes with the normals it carries,
    // while a plain ring keeps the flat style (`normal` is undefined there).
    const loopNormals = normals?.loops?.[index];
    drawList.lineStrip(loop, loopNormals === undefined ? options : { ...options, normals: loopNormals }, true);
  });
  shape.lines.forEach(([a, b], index) => {
    const lineNormal = normals?.lines?.[index];
    drawList.line(a, b, lineNormal === undefined ? options : { ...options, normal: lineNormal });
  });
}



/** Reference `_emit_sphere_s` emits a `SphereMesh` (64 radial segments, 32 rings). */
export function sphereSolidMesh(radius: number, center: Vec3, basis: Basis3): MeshData {
  return transformMeshByBasis(sphere(radius, 64, 32), center, basis);
}



/** Per-loop and per-line normals for the reference `*_n` entry points. */
export type ShapeNormals = {
  readonly loops?: readonly (readonly Vec3[])[];
  readonly lines?: readonly Vec3[];
};



/** `draw_sphere_n`: every ring shaded from the sphere centre (`_get_sphere_ring_normals`). */
export function sphereWireNormals(center: Vec3, shape: ShapeWire): ShapeNormals {
  return { loops: shape.loops.map((loop) => sphereRingNormals(center, loop)) };
}



/** Reference `_emit_cone_s` emits a `CylinderMesh` (`top_radius = 0`). */
export function coneSolidMesh(radius: number, height: number, center: Vec3, basis: Basis3): MeshData {
  return transformMeshByBasis(cone(radius, height, 64), center, basis);
}



/**
 * `draw_cone_n`: the base ring uses `_get_circle_normals` on the cone's base basis, the side
 * lines use `_get_cone_side_line_normals` (one tilted normal per line).
 */
export function coneWireNormals(shape: ShapeWire, radius: number, height: number, sideSegments: number, basis: Basis3): ShapeNormals {
  const ringNormals = circleNormals(shape.loops[0]?.length ?? 0, coneBaseBasis(basis));
  return {
    loops: shape.loops.map(() => ringNormals),
    lines: coneSideLineNormals(radius, height, sideSegments, basis),
  };
}



/** Reference `_emit_cylinder_s` emits a `CylinderMesh`. */
export function cylinderSolidMesh(radius: number, halfHeight: number, center: Vec3, basis: Basis3): MeshData {
  return transformMeshByBasis(cylinder(radius, halfHeight, 64), center, basis);
}



/**
 * `draw_cylinder_n`: both rings use `_get_circle_normals` on the ring basis, the wall lines
 * use `_get_cylinder_side_line_normals` (one radial normal per line).
 */
export function cylinderWireNormals(shape: ShapeWire, radius: number, halfHeight: number, sideSegments: number, basis: Basis3): ShapeNormals {
  const ringNormals = circleNormals(shape.loops[0]?.length ?? 0, coneBaseBasis(basis));
  return {
    loops: shape.loops.map(() => ringNormals),
    lines: cylinderSideLineNormals(radius, halfHeight, sideSegments, basis),
  };
}



/**
 * `draw_capsule_n`: cap rings use `_get_circle_normals` and the silhouettes
 * `_get_capsule_side_outline_normals`. Both reduce to the same formula here -- an outline
 * segment midpoint projected back onto the cap axis -- because a ring midpoint projects onto
 * its own cap centre, so one helper covers every loop in the reference order.
 */
export function capsuleWireNormals(shape: ShapeWire, halfHeight: number, center: Vec3, basis: Basis3): ShapeNormals {
  const axis = normalizeVector(basis.y);
  const bottomCenter = offsetAlong(center, axis, -halfHeight);
  const topCenter = offsetAlong(center, axis, halfHeight);
  return { loops: shape.loops.map((loop) => capsuleOutlineNormals(bottomCenter, topCenter, axis, loop)) };
}
