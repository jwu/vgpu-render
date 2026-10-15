import { describe, expect, test } from "vitest";
import { FrameRecorder, type LineCommand, type TriangleCommand, type Vec3 } from "../src/frame-recorder.js";
import { buildScene, CIRCLE_REFERENCE, LINE_REFERENCE } from "../src/godot-scenes.js";

function commandsFor(id: string): readonly (LineCommand | TriangleCommand | { kind: "point" })[] {
  const recorder = new FrameRecorder();
  buildScene(id, recorder, 0);
  return recorder.commands() as never;
}

function linesOf(id: string): LineCommand[] {
  return commandsFor(id).filter((command): command is LineCommand => command.kind === "line");
}

function trianglesOf(id: string): TriangleCommand[] {
  return commandsFor(id).filter((command): command is TriangleCommand => command.kind === "triangle");
}

function near(actual: readonly number[], expected: readonly number[], epsilon = 1e-6): boolean {
  return actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]!) < epsilon);
}

describe("Circle reference scene", () => {
  test("uses the source column and row coordinates", () => {
    expect(CIRCLE_REFERENCE.columns).toBe(11);
    expect(CIRCLE_REFERENCE.columnX(0)).toBe(0.5);
    expect(CIRCLE_REFERENCE.columnX(10)).toBe(20.5);
    // Row spacing differs for the radius column (1.15) versus the others (0.82).
    expect(near(CIRCLE_REFERENCE.center(0, 0), [-9.5, 0.1, 1.05])).toBe(true);
    expect(near(CIRCLE_REFERENCE.center(0, 1), [-9.5, 0.1, 0.23])).toBe(true);
    expect(near(CIRCLE_REFERENCE.center(1, 1), [-7.5, 0.1, -0.1])).toBe(true);
  });

  test("emits solid discs with the reference blue alpha", () => {
    const triangles = trianglesOf("circle");
    // SEGMENT_VALUES = [8, 16, 32, 64] triangles per disc.
    expect(triangles).toHaveLength(8 + 16 + 32 + 64);
    for (const triangle of triangles) {
      expect(triangle.color).toEqual([0.25, 0.65, 1, 0.45]);
    }
    const center = CIRCLE_REFERENCE.center(10, 0);
    expect(triangles.some((triangle) => near(triangle.a, center))).toBe(true);
  });

  test("keeps the wide normal row and the tilted rotation tunnel", () => {
    const lines = linesOf("circle");
    const wideNormal = lines.find((line) => near(line.color, [0.25, 0.95, 0.9, 1]) && line.width === 10);
    expect(wideNormal).toBeDefined();
    expect(wideNormal!.normal).toEqual([0, 1, 0]);
    // Rotation tunnel lifts the first row above the ground plane.
    const tunnel = lines.filter((line) => near(line.color, [0.95, 0.75, 0.25, 1], 1e-3) && Math.abs(line.start[1] - 0.45) < 1e-6);
    expect(tunnel.length).toBeGreaterThan(0);
  });

  test("keeps dashed circles as dashed rather than continuous", () => {
    const dashed = linesOf("circle").filter((line) => line.dash !== undefined && line.color[1] > 0.4 && line.color[1] < 0.5);
    expect(dashed.length).toBeGreaterThan(0);
    expect(dashed[0]!.dash![0]).toBeGreaterThan(0);
  });
});

describe("Curve reference scene", () => {
  test("draws the construction band with the reference anchor and control markers", () => {
    const lines = linesOf("curve");
    const anchors = lines.filter((line) => near(line.color, [1, 0.25, 0.85, 1]) && line.width === 2);
    const controlRings = lines.filter((line) => near(line.color, [1, 0.75, 0.15, 1]) && line.width === 2);
    const controlEdges = lines.filter((line) => near(line.color, [1, 0.75, 0.15, 0.85]) && line.width === 1);
    // 16 segments per closed marker ring; across the 7 construction curves there are 21
    // Bezier anchors and 24 non-zero in/out handles (`_draw_curve_control_points`).
    expect(anchors).toHaveLength(21 * 16);
    expect(controlRings).toHaveLength(24 * 16);
    expect(controlEdges).toHaveLength(24);
    // `_get_curve_marker_rotation` swaps the basis columns, so every ring is a horizontal
    // (XZ-plane) circle around its anchor instead of standing up in the curve's own plane.
    for (const line of [...anchors, ...controlRings]) expect(line.start[1]).toBeCloseTo(line.end[1], 9);
    // The straight curve has three handle-less anchors; the first sits at local (-0.5, 0, 0.18),
    // which the scene translation (-10, 0, 1.5) moves to (-10, 0.1, 1.23).
    const anchorCenter: Vec3 = [-10, 0.1, 1.23];
    const onFirstRing = anchors.filter((line) => Math.abs(Math.hypot(line.start[0] - anchorCenter[0], line.start[2] - anchorCenter[2]) - 0.045) < 1e-4);
    expect(onFirstRing.length).toBeGreaterThan(0);
    // Handle edges keep the reference handle lengths (`smoothSymmetricCurve` uses |(0.28, 0, -0.35)|).
    const edges = controlEdges.map((line) => Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1], line.end[2] - line.start[2]));
    expect(edges.filter((length) => Math.abs(length - Math.hypot(0.28, 0.35)) < 1e-6).length).toBeGreaterThan(0);
  });
});

describe("Line reference scene", () => {
  test("uses the source column and row coordinates", () => {
    expect(LINE_REFERENCE.columns).toBe(7);
    expect(LINE_REFERENCE.columnX(0)).toBe(0);
    expect(LINE_REFERENCE.columnX(6)).toBe(12);
    expect(near(LINE_REFERENCE.start(0, 0), [-10, 0.1, 1.05])).toBe(true);
    expect(near(LINE_REFERENCE.end(0, 0), [-8.9, 0.1, 1.05])).toBe(true);
  });

  test("emits the exact strip and loop point sets", () => {
    const strip = LINE_REFERENCE.strip(0, 0);
    expect(near(strip[0]!, [-10, 0.1, 1.23])).toBe(true);
    expect(near(strip[1]!, [-9.637, 0.1, 0.87])).toBe(true);
    expect(near(strip[2]!, [-9.274, 0.1, 1.23])).toBe(true);
    expect(near(strip[3]!, [-8.9, 0.1, 0.87])).toBe(true);
    const loop = LINE_REFERENCE.loop(4, 0);
    expect(near(loop[0]!, [-2, 0.1, 1.3])).toBe(true);
    expect(near(loop[1]!, [-0.9, 0.1, 1.3])).toBe(true);
    expect(near(loop[2]!, [-0.9, 0.1, 0.8])).toBe(true);
    expect(near(loop[3]!, [-2, 0.1, 0.8])).toBe(true);
    // Loop column draws a closed 4-segment path per row.
    const loops = linesOf("line").filter((line) => near(line.color, [1, 0.45, 0.2, 0.95]) && line.width === 8);
    expect(loops).toHaveLength(16);
  });

  test("accumulates dash distance across polyline segments", () => {
    const dashed = linesOf("line").filter((line) => line.dash !== undefined && near(line.color, [0.75, 0.45, 1, 1]));
    const offsets = dashed.map((line) => line.dash![2]);
    expect(new Set(offsets).size).toBeGreaterThanOrEqual(3);
    // First row segment lengths are 0.511..., 0.511..., 0.519...
    expect(Math.max(...offsets)).toBeCloseTo(1.022, 2);
  });

  test("single dashed lines keep the animated offset but a zero phase at t=0", () => {
    const single = linesOf("line").filter((line) => line.dash !== undefined && near(line.color, [0.7, 1, 0.25, 1]));
    expect(single).toHaveLength(4);
    for (const line of single) expect(line.dash![2]).toBe(0);
  });

  test("normal samples use the reference normal vectors", () => {
    const normals = linesOf("line").filter((line) => line.normal !== undefined && near(line.color, [0.25, 0.95, 0.9, 1]));
    expect(normals.length).toBe(4);
    expect(normals.map((line) => line.normal)).toEqual([
      [0, 0, 1],
      [0, 0.70710677, 0.70710677],
      [0, 1, 0],
      [0, 0, -1],
    ]);
  });
});
