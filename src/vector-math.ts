/**
 * Small vector helpers shared by the geometry generators and the example layouts.
 *
 * These live in the library rather than next to the gallery scenes because
 * `geometry-generators.ts` needs them, and a library module must not reach into
 * the example code.
 */

import type { Vec3 } from "./frame-draw-list.js";

export function normalizeVector(p: Vec3): Vec3 {
  const length = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / length, p[1] / length, p[2] / length];
}

export function crossVector(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Right-handed Rodrigues rotation, equivalent to Godot's `Vector3.rotated(axis, angle)`. */
export function rotateAroundAxis(p: Vec3, axis: Vec3, angle: number): Vec3 {
  const a = normalizeVector(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
  const cross = crossVector(a, p);
  return [
    p[0] * cos + cross[0] * sin + a[0] * dot * (1 - cos),
    p[1] * cos + cross[1] * sin + a[1] * dot * (1 - cos),
    p[2] * cos + cross[2] * sin + a[2] * dot * (1 - cos),
  ];
}

export type CircleBasis = { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };

/** Orthonormal basis for a circle in the plane whose normal is `normal`. */
export function circleBasis(normal: Vec3, angle: number): CircleBasis {
  const n = normalizeVector(normal);
  const reference: Vec3 = Math.abs(n[0]) > 0.95 ? [0, 0, 1] : [1, 0, 0];
  const projection = reference[0] * n[0] + reference[1] * n[1] + reference[2] * n[2];
  const planar: Vec3 = [reference[0] - n[0] * projection, reference[1] - n[1] * projection, reference[2] - n[2] * projection];
  const widthAxis = normalizeVector(rotateAroundAxis(normalizeVector(planar), n, angle));
  const heightAxis = normalizeVector(crossVector(n, widthAxis));
  return { x: widthAxis, y: heightAxis, z: n };
}
