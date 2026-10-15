/**
 * Camera math for the gallery.
 *
 * Two layers live here:
 *
 * - **The chart**: `(pivot, yaw, pitch, distance)` and the orthonormal basis it produces. The
 *   view matrix is built from that basis instead of `lookAt(eye, pivot)`, so the camera no
 *   longer assumes a world up direction. That assumption is what used to degenerate when the
 *   camera looked straight down or up, and why pitch had to be clamped to ±77°.
 * - **The velocity layer**: a drag is an angular velocity (rotation) or a linear velocity
 *   (translation), a wheel notch is a scalar velocity in log₂ space (distance/orthographic
 *   height), and inertia is the exact integral of an exponentially decaying velocity. Angles and
 *   scales compose by multiplication, so their velocities are rates (`exp`/`log` in the
 *   integrator); translation composes by addition, so its velocity is a plain vector. See Daniel
 *   Holden's notes on *scalar velocity* and on the *exponential map, angle axis and angular
 *   velocity* for the reasoning behind both.
 *
 * Everything here is pure so the behaviour is unit-testable without a GPU.
 */

import type { Vec3 } from "./frame-recorder.js";

/** The three orthonormal axes of a camera, in world space. `forward` points at the pivot. */
export type CameraBasis = {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
};

/** Reference `FreeCamera`: orbit pitch runs up to straight down/up, not to a chart limit. */
export const PITCH_LIMIT = Math.PI / 2;

/** `ln 2`, the base of the halflife in the velocity integrators. */
const LN2 = Math.LN2;

/** Camera axes for the orbit chart: `pitch` is the camera's elevation above the pivot. */
export function orbitBasis(yaw: number, pitch: number): CameraBasis {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return {
    right: [sinYaw, 0, -cosYaw],
    up: [-sinPitch * cosYaw, cosPitch, -sinPitch * sinYaw],
    forward: [-cosPitch * cosYaw, -sinPitch, -cosPitch * sinYaw],
  };
}

/** `eye = pivot - forward * distance`, matching the reference `FreeCamera._update_camera`. */
export function orbitEye(pivot: Vec3, basis: CameraBasis, distance: number): Vec3 {
  return [
    pivot[0] - basis.forward[0] * distance,
    pivot[1] - basis.forward[1] * distance,
    pivot[2] - basis.forward[2] * distance,
  ];
}

/**
 * Camera axes for WASD freelook. Unlike the orbit chart, `pitch` here is the look elevation, so
 * a positive pitch looks up; the handler negates the pointer delta to match.
 */
export function fpsBasis(yaw: number, pitch: number): CameraBasis {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return {
    right: [cosYaw, 0, sinYaw],
    up: [-sinYaw * sinPitch, cosPitch, cosYaw * sinPitch],
    forward: [sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch],
  };
}

/**
 * World-to-view matrix from a camera basis.
 *
 * Columns are the camera axes in world space (`right`, `up`, `-forward`), exactly what the
 * previous `lookAt(eye, target)` produced for the same pose, minus the world-up projection.
 */
export function viewMatrix(eye: Vec3, basis: CameraBasis): Float32Array {
  const x = basis.right;
  const y = basis.up;
  const z: Vec3 = [-basis.forward[0], -basis.forward[1], -basis.forward[2]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

/** A scalar that glides: its value plus the velocity that keeps moving it. */
export type Glide = { readonly value: number; readonly velocity: number };

/**
 * Exact integral of an exponentially decaying velocity over `dt`.
 *
 * `damper_exact`'s halflife form: the velocity halves every `halflife` seconds, so the leftover
 * travel is always `velocity * halflife / ln2` no matter how the frame time is split, and the
 * integration never overshoots.
 */
export function integrateGlide(value: number, velocity: number, halflife: number, dt: number): Glide {
  const lambda = LN2 / Math.max(halflife, 1e-6);
  const decay = Math.exp(-lambda * dt);
  return { value: value + (velocity * (1 - decay)) / lambda, velocity: velocity * decay };
}

/** Vector form of {@link integrateGlide}, for translation (which composes additively). */
export function integrateGlideVec3(value: Vec3, velocity: Vec3, halflife: number, dt: number): { value: Vec3; velocity: Vec3 } {
  const x = integrateGlide(value[0], velocity[0], halflife, dt);
  const y = integrateGlide(value[1], velocity[1], halflife, dt);
  const z = integrateGlide(value[2], velocity[2], halflife, dt);
  return { value: [x.value, y.value, z.value], velocity: [x.velocity, y.velocity, z.velocity] };
}

/**
 * The velocity whose glide travels `amount` in total (`∫v dt = v·halflife/ln2`).
 *
 * Expressing the cap on a fling as a distance/angle instead of a velocity keeps it meaningful:
 * a fast flick cannot throw the view further than that, whatever the frame rate was.
 */
export function glideVelocityFor(amount: number, halflife: number): number {
  return (amount * LN2) / Math.max(halflife, 1e-6);
}

/** Total travel of a gliding value before it settles, in the value's own units. */
export function glideTravel(velocity: number, halflife: number): number {
  return (velocity * Math.max(halflife, 1e-6)) / LN2;
}

export type Bounds = { readonly min: Vec3; readonly max: Vec3 };

/** Axis-aligned bounds of a point cloud, or `undefined` when there is nothing to frame. */
export function boundsOfPoints(points: Iterable<Vec3>): Bounds | undefined {
  let min: [number, number, number] | undefined;
  let max: [number, number, number] | undefined;
  for (const point of points) {
    if (min === undefined || max === undefined) {
      min = [point[0], point[1], point[2]];
      max = [point[0], point[1], point[2]];
      continue;
    }
    min = [Math.min(min[0], point[0]), Math.min(min[1], point[1]), Math.min(min[2], point[2])];
    max = [Math.max(max[0], point[0]), Math.max(max[1], point[1]), Math.max(max[2], point[2])];
  }
  return min === undefined || max === undefined ? undefined : { min, max };
}

/** Centre of bounds. */
export function boundsCenter(bounds: Bounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

/** Eight corners of an axis-aligned box. */
function boundsCorners(bounds: Bounds): readonly Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

/**
 * Framing that fits `bounds` for the camera's current orientation.
 *
 * The eight box corners are projected onto the camera's own axes and the required distance is
 * solved per corner (`distance + z >= |lateral| / tan(half fov)`), which keeps the fit tight for
 * the slab-like scene layouts (a 34 × 1.5 × 8 unit matrix) where a bounding sphere would waste
 * most of the view on the thin axis. The pivot is the box centre; the caller applies whichever of
 * `distance` / `orthographicHeight` its projection uses.
 */
export function frameBounds(
  bounds: Bounds,
  options: { readonly basis: CameraBasis; readonly fovY: number; readonly aspect: number; readonly margin?: number },
): { readonly pivot: Vec3; readonly distance: number; readonly orthographicHeight: number } {
  const margin = options.margin ?? 1.08;
  const aspect = Math.max(options.aspect, 1e-3);
  const tanY = Math.tan(options.fovY / 2);
  const tanX = tanY * aspect;
  const pivot = boundsCenter(bounds);
  let distance = 1;
  let halfHeight = 1e-3;
  for (const corner of boundsCorners(bounds)) {
    const offset: Vec3 = [corner[0] - pivot[0], corner[1] - pivot[1], corner[2] - pivot[2]];
    const x = Math.abs(dot3(offset, options.basis.right));
    const y = Math.abs(dot3(offset, options.basis.up));
    const depth = dot3(offset, options.basis.forward);
    distance = Math.max(distance, y / tanY - depth, x / tanX - depth);
    halfHeight = Math.max(halfHeight, y, x / aspect);
  }
  return {
    pivot,
    distance: distance * margin,
    orthographicHeight: halfHeight * 2 * margin,
  };
}

/** Dot product of two vectors, kept local so the module stays free of rendering imports. */
export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Camera state a screen-space pan has to scale against. */
export type CameraScale = {
  readonly projection: "perspective" | "orthographic";
  readonly fov: number;
  readonly distance: number;
  readonly orthographicHeight: number;
};

/**
 * World units covered by one canvas pixel at the orbit pivot.
 *
 * This is the scale a screen-parallel pan uses so the scene follows the cursor. Perspective
 * derives it from the orbit distance and the vertical FOV, orthographic from
 * `orthographicHeight` (the orbit distance has no bearing on an orthographic view's scale).
 */
export function worldUnitsPerPixel(camera: CameraScale, canvasHeight: number): number {
  const height = Math.max(canvasHeight, 1);
  if (camera.projection === "orthographic") return camera.orthographicHeight / height;
  return (2 * Math.tan(camera.fov / 2) * camera.distance) / height;
}
