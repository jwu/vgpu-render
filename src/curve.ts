import type { Vec3 } from "./frame-draw-list.js";

export type CurvePoint = { readonly position: Vec3; readonly in?: Vec3; readonly out?: Vec3 };
export type Curve3D = { readonly points: readonly CurvePoint[]; readonly closed?: boolean };
export type CurveTransform = { readonly center?: Vec3; readonly rotation?: readonly [number, number, number] };

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function rotatePoint(p: Vec3, rotation: readonly [number, number, number]): Vec3 {
  const [sx, cx] = [Math.sin(rotation[0]), Math.cos(rotation[0])];
  const [sy, cy] = [Math.sin(rotation[1]), Math.cos(rotation[1])];
  const [sz, cz] = [Math.sin(rotation[2]), Math.cos(rotation[2])];
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y1 = p[1] * cx - z1 * sx;
  const z2 = p[1] * sx + z1 * cx;
  return [x1 * cz - y1 * sz, x1 * sz + y1 * cz, z2];
}

function cubic(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

export function sampleCurve(curve: Curve3D, tolerance = 0.08, transform: CurveTransform = {}): Vec3[] {
  const points = curve.points;
  if (points.length < 2) return points.map((point) => add(rotatePoint(point.position, transform.rotation ?? [0, 0, 0]), transform.center ?? [0, 0, 0]));
  const rotation = transform.rotation ?? [0, 0, 0];
  const center = transform.center ?? [0, 0, 0];
  const place = (p: Vec3): Vec3 => add(rotatePoint(p, rotation), center);
  const steps = Math.max(2, Math.min(64, Math.ceil(0.5 / Math.max(tolerance, 0.001))));
  const out: Vec3[] = [];
  const count = curve.closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const p0 = a.position;
    const p1 = add(a.position, a.out ?? [0, 0, 0]);
    const p2 = add(b.position, b.in ?? [0, 0, 0]);
    const p3 = b.position;
    for (let s = 0; s < steps; s++) out.push(place(cubic(p0, p1, p2, p3, s / steps)));
  }
  out.push(place(curve.closed ? points[0]!.position : points[points.length - 1]!.position));
  return out;
}
