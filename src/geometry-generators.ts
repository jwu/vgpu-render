import type { Vec3 } from "./frame-recorder.js";

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
