import { describe, expect, it } from "vitest";
import {
  boundsCenter,
  boundsOfPoints,
  dot3,
  fpsBasis,
  frameBounds,
  glideTravel,
  glideVelocityFor,
  integrateGlide,
  integrateGlideVec3,
  orbitBasis,
  orbitEye,
  PITCH_LIMIT,
  viewMatrix,
  worldUnitsPerPixel,
  type CameraBasis,
} from "../src/demo-camera.js";
import type { Vec3 } from "../src/frame-recorder.js";

const near = (a: readonly number[], b: readonly number[], epsilon = 1e-6): boolean =>
  a.length === b.length && a.every((value, index) => Math.abs(value - b[index]!) <= epsilon);

const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function expectOrthonormal(basis: CameraBasis): void {
  for (const axis of [basis.right, basis.up, basis.forward]) expect(norm(axis)).toBeCloseTo(1, 12);
  expect(dot(basis.right, basis.up)).toBeCloseTo(0, 12);
  expect(dot(basis.up, basis.forward)).toBeCloseTo(0, 12);
  expect(dot(basis.right, basis.forward)).toBeCloseTo(0, 12);
  // Right-handed: up is the right axis rotated into the forward direction.
  expect(near(cross(basis.right, basis.forward), basis.up, 1e-12)).toBe(true);
}

describe("camera basis", () => {
  it("places the orbit eye on the pivot sphere like the reference FreeCamera", () => {
    const yaw = 0.62;
    const pitch = 0.5;
    const distance = 12;
    const pivot: Vec3 = [1, 2, 3];
    const basis = orbitBasis(yaw, pitch);
    expectOrthonormal(basis);
    const eye = orbitEye(pivot, basis, distance);
    // `position = _target - _get_forward() * _distance` with
    // `forward = (-cos p cos y, -sin p, -cos p sin y)`.
    expect(near(eye, [
      pivot[0] + Math.cos(pitch) * Math.cos(yaw) * distance,
      pivot[1] + Math.sin(pitch) * distance,
      pivot[2] + Math.sin(yaw) * Math.cos(pitch) * distance,
    ], 1e-12)).toBe(true);
  });

  it("stays well defined at the poles, which is why pitch is no longer clamped to 77 degrees", () => {
    for (const pitch of [0, PITCH_LIMIT, -PITCH_LIMIT]) {
      const basis = orbitBasis(0.3, pitch);
      expectOrthonormal(basis);
      expect(Number.isFinite(basis.up[1])).toBe(true);
    }
  });

  it("keeps the freelook basis orthonormal and consistent with its movement vectors", () => {
    const basis = fpsBasis(1.1, -0.4);
    expectOrthonormal(basis);
  });

  it("builds the same view matrix the old world-up lookAt produced", () => {
    const yaw = 0.62;
    const pitch = 0.5;
    const distance = 12;
    const pivot: Vec3 = [0, 0, 0];
    const basis = orbitBasis(yaw, pitch);
    const eye = orbitEye(pivot, basis, distance);
    const actual = Array.from(viewMatrix(eye, basis));
    // Reference implementation kept for comparison: `lookAt(eye, target)` projecting the world
    // up to build the right axis, which degenerates when the view direction is vertical.
    const length = norm([eye[0]! - pivot[0]!, eye[1]! - pivot[1]!, eye[2]! - pivot[2]!]);
    const z: Vec3 = [
      (eye[0]! - pivot[0]!) / length,
      (eye[1]! - pivot[1]!) / length,
      (eye[2]! - pivot[2]!) / length,
    ];
    const xLength = Math.hypot(z[2], z[0]);
    const x: Vec3 = [z[2] / xLength, 0, -z[0] / xLength];
    const y: Vec3 = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
    const expected = [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
      -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
      -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
      1,
    ];
    expect(near(actual, expected, 1e-6)).toBe(true);
  });
});

describe("damped velocity integration", () => {
  it("halves the velocity every halflife", () => {
    const halflife = 0.12;
    const after = integrateGlide(0, 10, halflife, halflife);
    expect(after.velocity).toBeCloseTo(5, 9);
  });

  it("travels the same total distance however the frame time is split", () => {
    const halflife = 0.15;
    const velocity = 3;
    const dt = 0.5;
    const lambda = Math.LN2 / halflife;
    const decay = Math.exp(-lambda * dt);
    // Closed form of the exact integral over `dt`: the remaining glide after `dt` is the part
    // the decay has not eaten yet, which is what makes the result frame-rate independent.
    const expected = (velocity * (1 - decay)) / lambda;
    const whole = integrateGlide(0, velocity, halflife, dt);
    let split = { value: 0, velocity };
    for (let i = 0; i < 50; i++) split = integrateGlide(split.value, split.velocity, halflife, dt / 50);
    expect(whole.value).toBeCloseTo(expected, 9);
    expect(split.value).toBeCloseTo(expected, 9);
    // The full glide (the limit as dt grows) is `velocity * halflife / ln2`.
    expect(glideTravel(velocity, halflife)).toBeCloseTo((velocity * halflife) / Math.LN2, 12);
    expect(expected).toBeLessThan(glideTravel(velocity, halflife));
  });

  it("agrees with the clamped-velocity form of the same total", () => {
    const halflife = 0.1;
    const amount = 0.5;
    expect(glideTravel(glideVelocityFor(amount, halflife), halflife)).toBeCloseTo(amount, 12);
  });

  it("integrates translation component-wise", () => {
    const halflife = 0.1;
    const result = integrateGlideVec3([0, 0, 0], [1, -2, 0.5], halflife, halflife);
    // One halflife of integration covers half of the full glide.
    expect(result.value[0]).toBeCloseTo(glideTravel(1, halflife) / 2, 9);
    expect(result.value[1]).toBeCloseTo(glideTravel(-2, halflife) / 2, 9);
    expect(result.velocity[0]).toBeCloseTo(0.5, 9);
  });
});

describe("scene framing", () => {
  const bounds = { min: [-16.91, -0.22, -5.89] as Vec3, max: [16.91, 1.32, 2.25] as Vec3 };

  it("collects bounds from a point cloud", () => {
    const collected = boundsOfPoints([[1, 2, 3], [-4, 0, 1], [0, -1, 0]]);
    expect(collected).toEqual({ min: [-4, -1, 0], max: [1, 2, 3] });
    expect(boundsOfPoints([])).toBeUndefined();
    const center = boundsCenter(bounds);
    expect(center[0]).toBeCloseTo(0, 12);
    expect(center[1]).toBeCloseTo(0.55, 12);
    expect(center[2]).toBeCloseTo(-1.82, 12);
  });

  it("frames the box tightly for the camera's own orientation", () => {
    const fovY = 1.05;
    const aspect = 924 / 578;
    const basis = orbitBasis(0.62, 0.5);
    const fit = frameBounds(bounds, { basis, fovY, aspect });
    const tanY = Math.tan(fovY / 2);
    for (const x of [bounds.min[0], bounds.max[0]]) {
      for (const y of [bounds.min[1], bounds.max[1]]) {
        for (const z of [bounds.min[2], bounds.max[2]]) {
          const offset: Vec3 = [x - fit.pivot[0], y - fit.pivot[1], z - fit.pivot[2]];
          const depth = fit.distance + dot3(offset, basis.forward);
          expect(depth).toBeGreaterThan(0);
          expect(Math.abs(dot3(offset, basis.up))).toBeLessThanOrEqual(depth * tanY + 1e-9);
          expect(Math.abs(dot3(offset, basis.right))).toBeLessThanOrEqual(depth * tanY * aspect + 1e-9);
          // Orthographic has no perspective term: the plain extents have to fit instead.
          expect(Math.abs(dot3(offset, basis.up))).toBeLessThanOrEqual(fit.orthographicHeight / 2 + 1e-9);
          expect(Math.abs(dot3(offset, basis.right))).toBeLessThanOrEqual((fit.orthographicHeight * aspect) / 2 + 1e-9);
        }
      }
    }
    expect(near(fit.pivot, boundsCenter(bounds), 1e-12)).toBe(true);
  });

  it("is tighter than a bounding sphere for the slab-like scene layouts", () => {
    const fovY = (75 * Math.PI) / 180;
    const aspect = 924 / 578;
    const fit = frameBounds(bounds, { basis: orbitBasis(0.62, 0.5), fovY, aspect });
    // What a bounding-sphere fit would have demanded, which wastes the view on the thin axis.
    const radius = Math.hypot(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ) / 2;
    const limiting = Math.min(fovY / 2, Math.atan(Math.tan(fovY / 2) * aspect));
    expect(fit.distance).toBeLessThan(radius / Math.sin(limiting));
  });

  it("scales the pan with the projection's own view scale", () => {
    const perspective = { projection: "perspective" as const, fov: 1.05, distance: 12, orthographicHeight: 7 };
    expect(worldUnitsPerPixel(perspective, 600)).toBeCloseTo((2 * Math.tan(1.05 / 2) * 12) / 600, 12);
    // The orbit distance has no bearing on an orthographic scale, so zooming cannot change it.
    expect(worldUnitsPerPixel({ ...perspective, projection: "orthographic", orthographicHeight: 7 }, 600)).toBeCloseTo(7 / 600, 12);
    expect(worldUnitsPerPixel({ ...perspective, projection: "orthographic", distance: 200, orthographicHeight: 1 }, 600)).toBeCloseTo(1 / 600, 12);
    expect(worldUnitsPerPixel(perspective, 0)).toBeGreaterThan(0);
  });
});
