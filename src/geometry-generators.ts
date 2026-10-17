import type { Vec3 } from "./frame-recorder.js";
import { crossVector, normalizeVector, rotateAroundAxis, type CircleBasis } from "./layout-3d.js";

export type Triangle = readonly [Vec3, Vec3, Vec3];
export type Segment = readonly [Vec3, Vec3];
export type MeshData = { readonly triangles: readonly Triangle[]; readonly segments: readonly Segment[] };

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const rotate = (p: Vec3, rotation: readonly [number, number, number]): Vec3 => {
  const [sx, cx] = [Math.sin(rotation[0]), Math.cos(rotation[0])];
  const [sy, cy] = [Math.sin(rotation[1]), Math.cos(rotation[1])];
  const [sz, cz] = [Math.sin(rotation[2]), Math.cos(rotation[2])];
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y1 = p[1] * cx - z1 * sx;
  const z2 = p[1] * sx + z1 * cx;
  return [x1 * cz - y1 * sz, x1 * sz + y1 * cz, z2];
};
const transformMesh = (mesh: MeshData, rotation: readonly [number, number, number], center: Vec3): MeshData => ({
  triangles: mesh.triangles.map(([a, b, c]) => [add(rotate(a, rotation), center), add(rotate(b, rotation), center), add(rotate(c, rotation), center)]),
  segments: mesh.segments.map(([a, b]) => [add(rotate(a, rotation), center), add(rotate(b, rotation), center)]),
});

export function rect(size: readonly [number, number], center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const [w, h] = size; const p: Vec3[] = [[-w / 2, 0, -h / 2], [w / 2, 0, -h / 2], [w / 2, 0, h / 2], [-w / 2, 0, h / 2]];
  return transformMesh({ triangles: [[p[0]!, p[1]!, p[2]!], [p[0]!, p[2]!, p[3]!]], segments: [[p[0]!, p[1]!], [p[1]!, p[2]!], [p[2]!, p[3]!], [p[3]!, p[0]!]] }, rotation, center);
}

export function box(size: Vec3, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const [x, y, z] = scale(size, 0.5); const p: Vec3[] = [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  const faces: Triangle[] = [[p[0]!, p[2]!, p[1]!], [p[0]!, p[3]!, p[2]!], [p[4]!, p[5]!, p[6]!], [p[4]!, p[6]!, p[7]!], [p[0]!, p[1]!, p[5]!], [p[0]!, p[5]!, p[4]!], [p[1]!, p[2]!, p[6]!], [p[1]!, p[6]!, p[5]!], [p[2]!, p[3]!, p[7]!], [p[2]!, p[7]!, p[6]!], [p[3]!, p[0]!, p[4]!], [p[3]!, p[4]!, p[7]!]];
  const edges: Segment[] = [[p[0]!, p[1]!], [p[1]!, p[2]!], [p[2]!, p[3]!], [p[3]!, p[0]!], [p[4]!, p[5]!], [p[5]!, p[6]!], [p[6]!, p[7]!], [p[7]!, p[4]!], [p[0]!, p[4]!], [p[1]!, p[5]!], [p[2]!, p[6]!], [p[3]!, p[7]!]];
  return transformMesh({ triangles: faces, segments: edges }, rotation, center);
}

export function disc(radius: number, segments = 32, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const triangles: Triangle[] = []; const segmentsOut: Segment[] = []; const origin: Vec3 = [0, 0, 0];
  for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; const b = (i + 1) / segments * Math.PI * 2; const p: Vec3 = [Math.cos(a) * radius, 0, Math.sin(a) * radius]; const q: Vec3 = [Math.cos(b) * radius, 0, Math.sin(b) * radius]; triangles.push([origin, p, q]); segmentsOut.push([p, q]); }
  return transformMesh({ triangles, segments: segmentsOut }, rotation, center);
}

export function arc(radius: number, angle: number, segments = 32, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const segmentsOut: Segment[] = []; const steps = Math.max(1, segments);
  for (let i = 0; i < steps; i++) { const a = i / steps * angle; const b = (i + 1) / steps * angle; segmentsOut.push([[Math.cos(a) * radius, 0, Math.sin(a) * radius], [Math.cos(b) * radius, 0, Math.sin(b) * radius]]); }
  return transformMesh({ triangles: [], segments: segmentsOut }, rotation, center);
}

export function cylinder(radius: number, halfHeight: number, segments = 32, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const triangles: Triangle[] = []; const edges: Segment[] = []; const top: Vec3[] = []; const bottom: Vec3[] = [];
  for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; bottom.push([Math.cos(a) * radius, -halfHeight, Math.sin(a) * radius]); top.push([Math.cos(a) * radius, halfHeight, Math.sin(a) * radius]); }
  for (let i = 0; i < segments; i++) { const n = (i + 1) % segments; triangles.push([bottom[i]!, bottom[n]!, top[n]!], [bottom[i]!, top[n]!, top[i]!], [[0, -halfHeight, 0], bottom[n]!, bottom[i]!], [[0, halfHeight, 0], top[i]!, top[n]!]); edges.push([bottom[i]!, bottom[n]!], [top[i]!, top[n]!], [bottom[i]!, top[i]!]); }
  return transformMesh({ triangles, segments: edges }, rotation, center);
}

export function cone(radius: number, height: number, segments = 32, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const triangles: Triangle[] = []; const edges: Segment[] = []; const apex: Vec3 = [0, height / 2, 0]; const base: Vec3[] = [];
  for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; base.push([Math.cos(a) * radius, -height / 2, Math.sin(a) * radius]); }
  for (let i = 0; i < segments; i++) { const n = (i + 1) % segments; triangles.push([base[i]!, base[n]!, apex], [[0, -height / 2, 0], base[n]!, base[i]!]); edges.push([base[i]!, base[n]!], [base[i]!, apex]); }
  return transformMesh({ triangles, segments: edges }, rotation, center);
}

export function sphere(radius: number, segments = 24, rings = 12, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const triangles: Triangle[] = []; const edges: Segment[] = []; const rows: Vec3[][] = [];
  for (let y = 0; y <= rings; y++) { const v = y / rings; const phi = v * Math.PI; const row: Vec3[] = []; for (let x = 0; x < segments; x++) { const a = x / segments * Math.PI * 2; row.push([Math.sin(phi) * Math.cos(a) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(a) * radius]); } rows.push(row); }
  for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) { const n = (x + 1) % segments; const a = rows[y]![x]!; const b = rows[y]![n]!; const c = rows[y + 1]![n]!; const d = rows[y + 1]![x]!; triangles.push([a, b, c], [a, c, d]); edges.push([a, b], [a, d]); }
  return transformMesh({ triangles, segments: edges }, rotation, center);
}

export function capsule(radius: number, halfHeight: number, segments = 24, rings = 8, center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0]): MeshData {
  const body = cylinder(radius, halfHeight, segments, center, rotation); const top = sphere(radius, segments, rings, add(center, [0, halfHeight, 0]), rotation); const bottom = sphere(radius, segments, rings, add(center, [0, -halfHeight, 0]), rotation); return { triangles: [...body.triangles, ...top.triangles, ...bottom.triangles], segments: [...body.segments, ...top.segments, ...bottom.segments] };
}

/**
 * Grid line segments, ported from `_emit_grid_lines` in `debug_draw_3d.gd`.
 *
 * Alignment contract, which the previous implementation got backwards:
 * - `outer` selects which boundary lines are **kept**: without `x`, the outermost line
 *   along X is dropped (`start = 1`, `end = cellCount`); with `x` the full range
 *   (`0 .. cellCount + 1`) is emitted. So `"none"` keeps only interior lines, and `"xz"`
 *   keeps every line including both boundaries.
 * - `skew` slants the lines themselves (`dx.z = sx * tan(skew.y)`,
 *   `dz.x = sz * tan(skew.x)`), not just an offset.
 */
// ---------------------------------------------------------------------------
// Wireframes ported from the reference `_emit_*` helpers.
//
// The reference does not draw sphere/cone/cylinder/capsule wireframes from a mesh: it
// emits one closed path per ring (`draw_line_loop`) plus loose segments for the side
// lines (`draw_line_list`). Reproducing that topology matters because the parameters are
// not interchangeable -- `sphere`'s y/z axis counts select latitude rings and meridian
// great circles, not mesh subdivision counts.
// ---------------------------------------------------------------------------

/** Closed paths the reference draws with `draw_line_loop`, plus `draw_line_list` segments. */
export type ShapeWire = {
  readonly loops: readonly (readonly Vec3[])[];
  readonly lines: readonly Segment[];
};

/** Reference `CIRCLE_SEGMENT_COUNT_MIN`; below it the reference emits nothing. */
const CIRCLE_SEGMENT_COUNT_MIN = 3;

/** Reference `SPHERE_AXIS_SEGMENT_COUNT_MIN`. */
const SPHERE_AXIS_SEGMENT_COUNT_MIN = 1;

/** Reference `is_zero_approx` (Godot `CMP_EPSILON`). */
const isZeroApprox = (value: number): boolean => Math.abs(value) < 0.00001;

const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subVec = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scaleVec = (v: Vec3, factor: number): Vec3 => [v[0] * factor, v[1] * factor, v[2] * factor];
const lengthSquared = (v: Vec3): number => v[0] * v[0] + v[1] * v[1] + v[2] * v[2];

/** `_get_cone_base_rotation`: `Basis(width_axis, axis.cross(width_axis), axis)`. */
export function coneBaseBasis(basis: CircleBasis): CircleBasis {
  const axis = normalizeVector(basis.y);
  const widthAxis = normalizeVector(basis.x);
  const heightAxis = crossVector(axis, widthAxis);
  const height = lengthSquared(heightAxis) <= 0 ? normalizeVector(basis.z) : normalizeVector(heightAxis);
  return { x: widthAxis, y: height, z: axis };
}

/** `_get_circle_points`: `center + (basis.x * cos + basis.y * sin) * radius`. */
export function circlePoints(center: Vec3, radius: number, segments: number, basis: CircleBasis): Vec3[] {
  if (radius <= 0 || segments < CIRCLE_SEGMENT_COUNT_MIN) return [];
  const points: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;
    points.push([
      center[0] + basis.x[0] * cos + basis.y[0] * sin,
      center[1] + basis.x[1] * cos + basis.y[1] * sin,
      center[2] + basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return points;
}

/** `Basis(axis, angle) * basis` in column language: rotate every column around `axis`. */
function rotateCircleBasis(basis: CircleBasis, axis: Vec3, angle: number): CircleBasis {
  return {
    x: rotateAroundAxis(basis.x, axis, angle),
    y: rotateAroundAxis(basis.y, axis, angle),
    z: rotateAroundAxis(basis.z, axis, angle),
  };
}

/** `_should_flip_sphere_ring_normal`: canonicalise a ring normal for de-duplication. */
function shouldFlipRingNormal(normal: Vec3): boolean {
  if (!isZeroApprox(normal[0])) return normal[0] < 0;
  if (!isZeroApprox(normal[1])) return normal[1] < 0;
  return normal[2] < 0;
}

/** `_get_sphere_ring_key`: quantise center/normal/radius so duplicates collapse. */
function sphereRingKey(center: Vec3, normal: Vec3, radius: number): string {
  let canonical = normalizeVector(normal);
  if (shouldFlipRingNormal(canonical)) canonical = scaleVec(canonical, -1);
  const quantize = (value: number): number => Math.round(value * 100000);
  return [
    quantize(center[0]), quantize(center[1]), quantize(center[2]),
    quantize(canonical[0]), quantize(canonical[1]), quantize(canonical[2]),
    quantize(radius),
  ].join(":");
}

/**
 * `_get_circle_normals`: outward normals of a circle, sampled half a segment ahead of each
 * point so every segment gets the radial direction at its own midpoint.
 */
export function circleNormals(segments: number, basis: CircleBasis): Vec3[] {
  if (segments < CIRCLE_SEGMENT_COUNT_MIN) return [];
  const normals: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (Math.PI * 2 * (i + 0.5)) / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    normals.push([
      basis.x[0] * cos + basis.y[0] * sin,
      basis.x[1] * cos + basis.y[1] * sin,
      basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return normals;
}

/** `_get_sphere_ring_normals`: each normal points from the sphere centre through the midpoint. */
export function sphereRingNormals(sphereCenter: Vec3, points: readonly Vec3[]): Vec3[] {
  const normals: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]!;
    const point = points[i]!;
    normals.push(
      normalizeVector([
        (point[0] + next[0]) * 0.5 - sphereCenter[0],
        (point[1] + next[1]) * 0.5 - sphereCenter[1],
        (point[2] + next[2]) * 0.5 - sphereCenter[2],
      ]),
    );
  }
  return normals;
}

/**
 * `_get_capsule_side_outline_normals`: project each segment midpoint onto the capsule axis
 * and use the direction from that axis point as the normal.
 *
 * Applied to a cap ring this reproduces `_get_circle_normals` exactly, because the ring
 * midpoints project onto the cap centre and the resulting directions are the ring radials.
 */
export function capsuleOutlineNormals(
  bottomCenter: Vec3,
  topCenter: Vec3,
  axis: Vec3,
  points: readonly Vec3[],
): Vec3[] {
  const midHeight = Math.hypot(topCenter[0] - bottomCenter[0], topCenter[1] - bottomCenter[1], topCenter[2] - bottomCenter[2]);
  const normals: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]!;
    const point = points[i]!;
    const midpoint: Vec3 = [(point[0] + next[0]) * 0.5, (point[1] + next[1]) * 0.5, (point[2] + next[2]) * 0.5];
    const fromBottom = subVec(midpoint, bottomCenter);
    const axisDistance = Math.min(Math.max(fromBottom[0] * axis[0] + fromBottom[1] * axis[1] + fromBottom[2] * axis[2], 0), midHeight);
    const normalCenter = addVec(bottomCenter, scaleVec(axis, axisDistance));
    normals.push(normalizeVector(subVec(midpoint, normalCenter)));
  }
  return normals;
}

/**
 * `_get_arc_normals`: radial normals at each segment midpoint of an arc sweep. An arc is a
 * strip, so it takes one normal per segment rather than per vertex.
 */
export function arcNormals(angle: number, segments: number, basis: CircleBasis): Vec3[] {
  if (angle === 0 || segments < CIRCLE_SEGMENT_COUNT_MIN) return [];
  const normals: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const arcAngle = (angle * (i + 0.5)) / segments;
    const cos = Math.cos(arcAngle);
    const sin = Math.sin(arcAngle);
    normals.push([
      basis.x[0] * cos + basis.y[0] * sin,
      basis.x[1] * cos + basis.y[1] * sin,
      basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return normals;
}

/**
 * `_get_rect_normals`: one normal per corner, in the `_get_rect_points` order `rectLoop` uses
 * (`-w-h`, `+w-h`, `+w+h`, `-w+h`).
 */
export function rectNormals(basis: CircleBasis): Vec3[] {
  return [scaleVec(basis.y, -1), basis.x, basis.y, scaleVec(basis.x, -1)];
}

/** Coordinates of `point` in the orthonormal frame `basis`, relative to `origin`. */
function localCoordinates(point: Vec3, origin: Vec3, basis: CircleBasis): Vec3 {
  const offset: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  return [
    offset[0] * basis.x[0] + offset[1] * basis.x[1] + offset[2] * basis.x[2],
    offset[0] * basis.y[0] + offset[1] * basis.y[1] + offset[2] * basis.y[2],
    offset[0] * basis.z[0] + offset[1] * basis.z[1] + offset[2] * basis.z[2],
  ];
}

/**
 * `_get_box_line_normals`, derived from the edges themselves rather than from a fixed table.
 *
 * A box edge runs along one basis axis and joins the two faces whose normals are the other two
 * axes, so its normal is the sum of those two unit axes with the signs of the edge's position.
 * Deriving it keeps the normals aligned with whatever order the mesh generator emits edges in,
 * instead of depending on the reference's own point order.
 */
export function boxEdgeNormals(segments: readonly Segment[], center: Vec3, basis: CircleBasis): Vec3[] {
  const axes: readonly Vec3[] = [basis.x, basis.y, basis.z];
  const normals: Vec3[] = [];
  for (const [from, to] of segments) {
    const fromLocal = localCoordinates(from, center, basis);
    const toLocal = localCoordinates(to, center, basis);
    // The axis the edge runs along is the one whose coordinate differs between its endpoints.
    const along = [0, 1, 2].find((index) => Math.abs(fromLocal[index]! - toLocal[index]!) > 1e-9) ?? 0;
    let normal: Vec3 = [0, 0, 0];
    for (const index of [0, 1, 2]) {
      if (index === along) continue;
      const sign = fromLocal[index]! + toLocal[index]! >= 0 ? 1 : -1;
      normal = addVec(normal, scaleVec(axes[index]!, sign));
    }
    normals.push(normalizeVector(normal));
  }
  return normals;
}

/** `_get_cone_side_line_normals`: one normal per side line, tilted along the cone slope. */
export function coneSideLineNormals(
  radius: number,
  height: number,
  sideSegmentCount: number,
  basis: CircleBasis,
): Vec3[] {
  if (radius <= 0 || height <= 0 || sideSegmentCount <= 0) return [];
  const axis = normalizeVector(basis.y);
  const baseBasis = coneBaseBasis(basis);
  const normals: Vec3[] = [];
  for (let i = 0; i < sideSegmentCount; i++) {
    const angle = (Math.PI * 2 * i) / sideSegmentCount;
    const radial = addVec(scaleVec(baseBasis.x, Math.cos(angle)), scaleVec(baseBasis.y, Math.sin(angle)));
    normals.push(normalizeVector(addVec(scaleVec(radial, height), scaleVec(axis, radius))));
  }
  return normals;
}

/** `_get_cylinder_side_line_normals`: one radial normal per wall line. */
export function cylinderSideLineNormals(
  radius: number,
  halfHeight: number,
  sideSegmentCount: number,
  basis: CircleBasis,
): Vec3[] {
  if (radius <= 0 || halfHeight <= 0 || sideSegmentCount <= 0) return [];
  const ringBasis = coneBaseBasis(basis);
  const normals: Vec3[] = [];
  for (let i = 0; i < sideSegmentCount; i++) {
    const angle = (Math.PI * 2 * i) / sideSegmentCount;
    normals.push(
      normalizeVector(addVec(scaleVec(ringBasis.x, Math.cos(angle)), scaleVec(ringBasis.y, Math.sin(angle)))),
    );
  }
  return normals;
}

/**
 * `_emit_sphere_axis_rings`: `y_axis_segment_count` latitude rings plus
 * `z_axis_segment_count` meridian great circles, de-duplicated by ring key.
 *
 * - Latitude rings sit at `radius * (-1 + 2i/n)` for `i in 1..n-1` with ring radius
 *   `sqrt(r^2 - offset^2)`, so `n < 2` draws none and `n = 2` draws the equator only.
 * - Great circles all have radius `radius` and advance by `PI / z` around `basis.y`, so
 *   `z < 1` draws none. A count of `z` yields `ceil(z / 2)` distinct circles, because the
 *   ring key folds opposite normals together.
 */
export function sphereWire(
  radius: number,
  segments: number,
  yAxisSegmentCount: number,
  zAxisSegmentCount: number,
  center: Vec3,
  basis: CircleBasis,
): ShapeWire {
  if (radius <= 0 || segments < CIRCLE_SEGMENT_COUNT_MIN) return { loops: [], lines: [] };
  const loops: Vec3[][] = [];
  const seen = new Set<string>();

  if (yAxisSegmentCount >= 2) {
    // `Basis(basis.x, basis.z, -basis.y)`: ring plane spanned by basis.x/basis.z.
    const ringBasis: CircleBasis = { x: basis.x, y: basis.z, z: scaleVec(basis.y, -1) };
    for (let i = 1; i < yAxisSegmentCount; i++) {
      const offset = radius * (-1 + (2 * i) / yAxisSegmentCount);
      const ringRadius = Math.sqrt(Math.max(radius * radius - offset * offset, 0));
      if (ringRadius <= 0) continue;
      const ringCenter = addVec(center, scaleVec(basis.y, offset));
      const key = sphereRingKey(ringCenter, basis.y, ringRadius);
      if (seen.has(key)) continue;
      seen.add(key);
      loops.push(circlePoints(ringCenter, ringRadius, segments, ringBasis));
    }
  }

  if (zAxisSegmentCount >= SPHERE_AXIS_SEGMENT_COUNT_MIN) {
    // `Basis(basis.y, basis.z, basis.x)` rotated in `PI / z` steps around basis.y.
    const baseCircleBasis: CircleBasis = { x: basis.y, y: basis.z, z: basis.x };
    const axis = normalizeVector(basis.y);
    const angleStep = Math.PI / zAxisSegmentCount;
    for (let i = 0; i < zAxisSegmentCount; i++) {
      const circleBasis = rotateCircleBasis(baseCircleBasis, axis, angleStep * i);
      const key = sphereRingKey(center, circleBasis.z, radius);
      if (seen.has(key)) continue;
      seen.add(key);
      loops.push(circlePoints(center, radius, segments, circleBasis));
    }
  }

  return { loops, lines: [] };
}

/**
 * `_get_capsule_side_outline_points`: half arc over the top cap, half arc under the
 * bottom cap, forming the capsule silhouette in the `radial` plane.
 */
function capsuleSideOutline(
  bottomCenter: Vec3,
  topCenter: Vec3,
  axis: Vec3,
  radial: Vec3,
  radius: number,
  arcSegmentCount: number,
): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= arcSegmentCount; i++) {
    const angle = (Math.PI * i) / arcSegmentCount;
    const offset = addVec(scaleVec(radial, Math.cos(angle) * radius), scaleVec(axis, Math.sin(angle) * radius));
    points.push(addVec(topCenter, offset));
  }
  for (let i = 0; i <= arcSegmentCount; i++) {
    const angle = Math.PI + (Math.PI * i) / arcSegmentCount;
    const offset = addVec(scaleVec(radial, Math.cos(angle) * radius), scaleVec(axis, Math.sin(angle) * radius));
    points.push(addVec(bottomCenter, offset));
  }
  return points;
}

/**
 * `_emit_capsule`: bottom/top cylinder rings plus `side_segment_count` closed side
 * outlines. The reference has no solid capsule variant, so this is the whole wireframe.
 */
export function capsuleWire(
  radius: number,
  halfHeight: number,
  segments: number,
  sideSegmentCount: number,
  center: Vec3,
  basis: CircleBasis,
): ShapeWire {
  if (radius <= 0 || halfHeight < 0 || segments < CIRCLE_SEGMENT_COUNT_MIN) return { loops: [], lines: [] };
  const axis = normalizeVector(basis.y);
  const bottomCenter = subVec(center, scaleVec(axis, halfHeight));
  const topCenter = addVec(center, scaleVec(axis, halfHeight));
  const ringBasis = coneBaseBasis(basis);
  const loops: Vec3[][] = [circlePoints(bottomCenter, radius, segments, ringBasis)];
  if (bottomCenter.some((value, index) => Math.abs(value - topCenter[index]!) >= 0.00001)) {
    loops.push(circlePoints(topCenter, radius, segments, ringBasis));
  }

  if (sideSegmentCount >= SPHERE_AXIS_SEGMENT_COUNT_MIN) {
    const arcSegmentCount = Math.max(1, Math.ceil(segments * 0.5));
    for (let i = 0; i < sideSegmentCount; i++) {
      const angle = (Math.PI * i) / sideSegmentCount;
      const radial = normalizeVector(addVec(scaleVec(ringBasis.x, Math.cos(angle)), scaleVec(ringBasis.y, Math.sin(angle))));
      loops.push(capsuleSideOutline(bottomCenter, topCenter, axis, radial, radius, arcSegmentCount));
    }
  }

  return { loops, lines: [] };
}

/**
 * `_get_cone_base_points` + `_get_cone_side_line_points`: the base ring is a loop and
 * the side lines are `apex -> base point` pairs emitted as a line list.
 */
export function coneWire(
  radius: number,
  height: number,
  segments: number,
  sideSegmentCount: number,
  center: Vec3,
  basis: CircleBasis,
): ShapeWire {
  if (radius <= 0 || height <= 0 || segments < CIRCLE_SEGMENT_COUNT_MIN) return { loops: [], lines: [] };
  const baseCenter = subVec(center, scaleVec(basis.y, height * 0.5));
  const apex = addVec(center, scaleVec(basis.y, height * 0.5));
  const baseBasis = coneBaseBasis(basis);
  const lines: Segment[] = [];
  if (sideSegmentCount > 0) {
    for (let i = 0; i < sideSegmentCount; i++) {
      const angle = (Math.PI * 2 * i) / sideSegmentCount;
      const offset = addVec(scaleVec(baseBasis.x, Math.cos(angle) * radius), scaleVec(baseBasis.y, Math.sin(angle) * radius));
      lines.push([apex, addVec(baseCenter, offset)]);
    }
  }
  return { loops: [circlePoints(baseCenter, radius, segments, baseBasis)], lines };
}

/**
 * `_get_cylinder_ring_points` + `_get_cylinder_side_line_points`: two rings and
 * `side_segment_count` vertical wall segments.
 */
export function cylinderWire(
  radius: number,
  halfHeight: number,
  segments: number,
  sideSegmentCount: number,
  center: Vec3,
  basis: CircleBasis,
): ShapeWire {
  if (radius <= 0 || halfHeight <= 0 || segments < CIRCLE_SEGMENT_COUNT_MIN) return { loops: [], lines: [] };
  const ringBasis = coneBaseBasis(basis);
  const bottomCenter = subVec(center, scaleVec(basis.y, halfHeight));
  const topCenter = addVec(center, scaleVec(basis.y, halfHeight));
  const lines: Segment[] = [];
  for (let i = 0; i < sideSegmentCount; i++) {
    const angle = (Math.PI * 2 * i) / sideSegmentCount;
    const radial = addVec(scaleVec(ringBasis.x, Math.cos(angle) * radius), scaleVec(ringBasis.y, Math.sin(angle) * radius));
    lines.push([addVec(bottomCenter, radial), addVec(topCenter, radial)]);
  }
  return {
    loops: [circlePoints(bottomCenter, radius, segments, ringBasis), circlePoints(topCenter, radius, segments, ringBasis)],
    lines,
  };
}

export function gridLines(cells: readonly [number, number], spacing: readonly [number, number], center: Vec3 = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0], skew: readonly [number, number] = [0, 0], outer: "none" | "x" | "z" | "xz" = "none"): Segment[] {
  const [cellX, cellZ] = cells;
  const [spacingX, spacingZ] = spacing;
  if (cellX <= 0 || cellZ <= 0 || spacingX <= 0 || spacingZ <= 0) return [];
  const skewTan: readonly [number, number] = [Math.tan(skew[0]), Math.tan(skew[1])];
  const dx: Vec3 = [spacingX, 0, spacingX * skewTan[1]];
  const dz: Vec3 = [spacingZ * skewTan[0], 0, spacingZ];
  const start: Vec3 = [-dx[0] * cellX * 0.5 - dz[0] * cellZ * 0.5, 0, -dx[2] * cellX * 0.5 - dz[2] * cellZ * 0.5];
  const place = (p: Vec3): Vec3 => add(rotate(p, rotation), center);
  const scale = (v: Vec3, n: number): Vec3 => [v[0] * n, v[1] * n, v[2] * n];
  const plus = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const keepX = outer === "x" || outer === "xz";
  const keepZ = outer === "z" || outer === "xz";
  const segments: Segment[] = [];
  for (let zIndex = keepX ? 0 : 1; zIndex < (keepX ? cellZ + 1 : cellZ); zIndex++) {
    const from = plus(start, scale(dz, zIndex));
    segments.push([place(from), place(plus(from, scale(dx, cellX)))]);
  }
  for (let xIndex = keepZ ? 0 : 1; xIndex < (keepZ ? cellX + 1 : cellX); xIndex++) {
    const from = plus(start, scale(dx, xIndex));
    segments.push([place(from), place(plus(from, scale(dz, cellZ)))]);
  }
  return segments;
}
