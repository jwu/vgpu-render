import { describe, expect, test } from "vitest";
import {
  DEFAULT_CAMERA_2D,
  projection2D,
  screenProjection,
  screenToWorld2d,
  world2dProjection,
  world2dToScreen,
} from "../src/camera-2d.js";

const VIEWPORT = [200, 100] as const;

/** `clip = matrix * (x, y, z, 1)` for a column-major 4x4. */
function apply(matrix: Float32Array, x: number, y: number, z = 0): [number, number, number, number] {
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
    matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!,
  ];
}

/** The matrices are `Float32Array`s, so exact decimal equality would only test the rounding. */
function expectClip(matrix: Float32Array, x: number, y: number, expected: readonly [number, number, number, number], z = 0): void {
  const clip = apply(matrix, x, y, z);
  expected.forEach((value, index) => expect(clip[index]).toBeCloseTo(value, 6));
}

describe("world2dProjection", () => {
  test("puts the origin at the canvas centre and +y up", () => {
    const matrix = world2dProjection(DEFAULT_CAMERA_2D, VIEWPORT);
    expectClip(matrix, 0, 0, [0, 0, 0, 1]);
    expectClip(matrix, 100, 0, [1, 0, 0, 1]);
    expectClip(matrix, 0, 50, [0, 1, 0, 1]);
    expectClip(matrix, -100, -50, [-1, -1, 0, 1]);
  });

  test("pins z to the near plane so the 2D layer can reuse the 3D shaders", () => {
    const matrix = world2dProjection(DEFAULT_CAMERA_2D, VIEWPORT);
    expect(apply(matrix, 37, -12, 5)[2]).toBe(0);
    expect(apply(matrix, 37, -12, 5)[3]).toBe(1);
  });

  test("magnifies by zoom", () => {
    const zoomed = world2dProjection({ pan: [0, 0], zoom: 2 }, VIEWPORT);
    expectClip(zoomed, 50, 0, [1, 0, 0, 1]);
    expectClip(zoomed, 0, 25, [0, 1, 0, 1]);
  });

  test("translates the view by pan", () => {
    const panned = world2dProjection({ pan: [25, -10], zoom: 1 }, VIEWPORT);
    expectClip(panned, 25, -10, [0, 0, 0, 1]);
    expectClip(panned, 125, -10, [1, 0, 0, 1]);
  });

  test("rejects a non-positive zoom and survives an unsized target", () => {
    expect(() => world2dProjection({ pan: [0, 0], zoom: 0 }, VIEWPORT)).toThrow("greater than zero");
    const matrix = world2dProjection(DEFAULT_CAMERA_2D, [0, 0]);
    expect(matrix.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe("screenProjection", () => {
  test("maps the top-left origin, +y down pixel space", () => {
    const matrix = screenProjection(VIEWPORT);
    expectClip(matrix, 0, 0, [-1, 1, 0, 1]);
    expectClip(matrix, 200, 100, [1, -1, 0, 1]);
    expectClip(matrix, 100, 50, [0, 0, 0, 1]);
  });

  test("ignores the 2D camera", () => {
    const panned = projection2D("screen", { pan: [50, 50], zoom: 4 }, VIEWPORT);
    expect(Array.from(panned)).toEqual(Array.from(screenProjection(VIEWPORT)));
  });
});

describe("2D coordinate conversions", () => {
  test("world2dToScreen and screenToWorld2d are inverses", () => {
    const camera = { pan: [12, -3], zoom: 1.5 } as const;
    expect(world2dToScreen([0, 0], camera, VIEWPORT)).toEqual([100 - 12 * 1.5, 50 - 3 * 1.5]);
    const screen = world2dToScreen([40, -20], camera, VIEWPORT);
    const roundTrip = screenToWorld2d(screen, camera, VIEWPORT);
    expect(roundTrip[0]).toBeCloseTo(40);
    expect(roundTrip[1]).toBeCloseTo(-20);
  });

  test("agrees with the projection: a point on the top-right corner lands at clip (1, 1)", () => {
    const camera = { pan: [10, -5], zoom: 2 } as const;
    const matrix = world2dProjection(camera, VIEWPORT);
    const point = screenToWorld2d([200, 0], camera, VIEWPORT);
    expectClip(matrix, point[0], point[1], [1, 1, 0, 1]);
  });
});
